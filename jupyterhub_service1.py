from flask import Flask, request, jsonify, make_response
import requests
from flask_cors import CORS, cross_origin
from flask_socketio import SocketIO, emit
import threading
import logging
import subprocess
import os
import json
import time
from flask_socketio import join_room, leave_room
import tempfile  # Add this import for creating temporary files
import ast
import openai
from nbformat import read
from nbconvert import PythonExporter
openai.api_key = os.getenv("OPENAI_API_KEY")  # Ensure the API key is exported as an environment variable
import black
import textwrap

import psycopg2
from psycopg2.extras import DictCursor
import ast
import re
from black import format_str, FileMode
import signal

import tiktoken  # Ensure this package is installed

# Enable logging for debugging
logging.basicConfig(level=logging.DEBUG)

# Flask and WebSocket setup
app = Flask(__name__)
# CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)


DATABASE_URL = "postgresql://xtraders:10XTRaders!!@localhost/notebooks_db"

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="gevent",
    ping_timeout=60,
    ping_interval=25,
    logger=True,
    engineio_logger=True,
    message_queue_size=2000,  # Increased queue size
)


# Admin token and JupyterHub base URL
ADMIN_TOKEN = "d4a15a6377d94a34a5f93d2dc7c4ab13"
JUPYTERHUB_URL = "http://localhost:8000/hub/apa"
BASE_NOTEBOOKS_DIR = "/home"  # Base directory for user home directories

# Global dictionary to track running notebooks
# running_notebooks = {}
failed_notebooks = {}

running_notebooks = {}  # Initialize globally to track running processes

user_rooms = set()  # Global set to track users who have joined WebSocket rooms

def get_db_connection():
    """Establish a connection to the PostgreSQL database."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=DictCursor)

def init_db():
    """Initialize the PostgreSQL database with the required schema."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notebook_statuses (
                    id SERIAL PRIMARY KEY,
                    username TEXT NOT NULL,
                    notebook_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error_message TEXT DEFAULT NULL,
                    UNIQUE(username, notebook_name)
                );
            """)
            conn.commit()

def unsanitize_username(sanitized_username):
    """Revert sanitized username back to its original format."""
    return sanitized_username.replace('_at_', '@').replace('_dot_', '.')


emit_timestamps = {}  # Global dictionary to track last emit times

def log_and_emit(message, level="info", event=None, data=None, to=None, min_interval=0.5):
    """
    Log messages with optional WebSocket emission, throttled to avoid flooding.
    """
    log_func = getattr(logging, level, logging.info)
    log_func(message)
    

    if event and data:
        # Throttle messages to the same client
        now = time.time()
        last_emit = emit_timestamps.get((event, to), 0)
        if now - last_emit < min_interval:
            log_func(f"Throttled WebSocket event: {event} to room: {to}")
            return

        emit_timestamps[(event, to)] = now
        socketio.emit(event, data, to=unsanitize_username(to))


def broadcast_user_notebooks(username):
    """Broadcast the status of notebooks owned by the given user."""
    user_running = running_notebooks.get(username, {})
    user_failed = failed_notebooks.get(username, {})
    
    notebook_dir = ensure_user_environment(username)
    all_notebooks = [
        f.replace(".ipynb", "") for f in os.listdir(notebook_dir) if f.endswith(".ipynb")
    ]

    running_list = [{"notebook_name": notebook, "status": "running"} for notebook in user_running.keys()]
    failed_list = [{"notebook_name": notebook, "status": "failed", "error": error} for notebook, error in user_failed.items()]
    stopped_list = [{"notebook_name": notebook, "status": "stopped"} for notebook in all_notebooks if notebook not in user_running and notebook not in user_failed]

    socketio.emit(
        "user_notebook_statuses",
        {"running": running_list, "failed": failed_list, "stopped": stopped_list},
        to=unsanitize_username(username)
    )

# Utility function to ensure user environment
def ensure_user_environment(username):
    """Ensure the user's environment is set up."""
    log_and_emit(f"Ensuring user environment for: {username}", "debug")
    try:
        user_home = os.path.join(BASE_NOTEBOOKS_DIR, username)
        notebook_dir = os.path.join(user_home, "notebooks")

        if not os.path.exists(user_home):
            subprocess.run(["sudo", "mkdir", "-p", user_home], check=True)
            subprocess.run(["sudo", "chown", "-R", f"{username}:{username}", user_home], check=True)

        if not os.path.exists(notebook_dir):
            subprocess.run(["sudo", "mkdir", "-p", notebook_dir], check=True)
            subprocess.run(["sudo", "chown", "-R", f"{username}:{username}", notebook_dir], check=True)

        return notebook_dir
    except subprocess.CalledProcessError as e:
        log_and_emit(f"Error ensuring user environment: {e}", "error")
        raise RuntimeError(f"Error: {e.stderr.decode().strip()}")

def clean_content(content: str) -> str:
    """
    Minimal cleaning to remove problematic characters before passing to OpenAI.
    """
    replacements = {
        '“': '"', '”': '"',  # Double quotes
        '‘': "'", '’': "'",  # Single quotes
        '–': '-', '—': '-',  # Dashes
    }
    for old, new in replacements.items():
        content = content.replace(old, new)
    return content


def split_content_into_chunks(content: str, chunk_size: int = 6000) -> list:
    """
    Splits content into manageable chunks for processing with the OpenAI model.
    """
    lines = content.splitlines()
    chunks = []
    current_chunk = []

    for line in lines:
        if len("\n".join(current_chunk + [line])) > chunk_size:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
        else:
            current_chunk.append(line)

    if current_chunk:
        chunks.append("\n".join(current_chunk))

    return chunks




def validate_python_code(code: str) -> bool:
    """
    Validates Python code by parsing it using the ast module.
    Returns True if the code is valid, otherwise False.
    """
    try:
        ast.parse(code)
        return True
    except SyntaxError as e:
        print(f"Syntax Error: {e}")
        return False

def clean_generated_code(code: str) -> str:
    """
    Cleans the generated Python code to ensure it does not contain markdown syntax or unintended artifacts.
    """
    # Remove markdown markers like ```python and ```
    if code.startswith("```python"):
        code = code[9:]  # Remove ` ```python `
    if code.startswith("```"):
        code = code[3:]  # Remove ` ``` `
    if code.endswith("```"):
        code = code[:-3]

    # Strip leading/trailing whitespace
    return code.strip()


def clean_generated_code(code: str) -> str:
    """
    Cleans up the generated Python code to remove unwanted artifacts:
    - Markdown markers like ```python or ```
    - Trailing or leading spaces
    - Non-ASCII characters like smart quotes (‘ ’ “ ”)
    """
    # Remove markdown markers
    code = re.sub(r"^```(python)?", "", code.strip(), flags=re.MULTILINE)
    code = re.sub(r"```$", "", code.strip(), flags=re.MULTILINE)

    # Replace smart quotes with standard quotes
    code = code.replace("‘", "'").replace("’", "'")
    code = code.replace("“", "\"").replace("”", "\"")

    # Remove any non-printable characters
    code = "".join(char for char in code if char.isprintable())

    return code.strip()


def clean_generated_code(code):
    """
    Cleans and formats Python code.
    - Replaces non-standard characters with standard ones.
    - Formats and corrects indentation using `black`.
    """
    # Step 1: Replace non-standard characters
    replacements = {
        '“': '"', '”': '"',  # Double quotes
        '‘': "'", '’': "'",  # Single quotes
        '–': '-', '—': '-',  # Dashes
        '…': '...',           # Ellipsis
    }
    for old, new in replacements.items():
        code = code.replace(old, new)

    # Step 2: Format code using `black` to fix indentation and style
    try:
        formatted_code = format_str(code, mode=FileMode())
    except Exception as e:
        raise ValueError(f"Error formatting code with black: {e}")

    return formatted_code

def validate_python_code(code: str) -> bool:
    """
    Validates the Python code for syntax errors using the `ast` module.
    Returns True if the code is valid; otherwise, raises a SyntaxError.
    """
    try:
        ast.parse(code)  # Parse the code to check for syntax errors
        return True
    except SyntaxError as e:
        print(f"SyntaxError: {e}")
        return False

def ensure_consistent_indentation(code: str) -> str:
    try:
        return format_str(code, mode=FileMode())
    except Exception as e:
        log_and_emit(f"Error formatting code with Black: {e}", "error")
        return code  # Return the original code if Black fails

def format_with_openai(content: str) -> str:
    """
    Uses the OpenAI API to rewrite content into valid, well-formatted Python code.
    Processes the entire content in a single request, ensuring it adheres to Python standards.

    Returns the cleaned and formatted code as a single string.
    """
    # Define model and token limits
    model = "gpt-4o"  # Use your preferred OpenAI model
    max_tokens = 8000  # Total token limit for OpenAI API (input + output)
    response_token_buffer = 3000  # Reserve tokens for the response
    max_input_tokens = max_tokens - response_token_buffer  # Input token limit
    # Calculate the token count of the content
    encoding = tiktoken.encoding_for_model(model)
    token_count = len(encoding.encode(content))

    if token_count > max_input_tokens:
        raise ValueError(f"Content exceeds the maximum allowed input tokens ({max_input_tokens}). Reduce content size.")

    logging.info(f"Formatting content with {token_count} tokens...")

    try:
        # Send the content to OpenAI for processing
        response = openai.ChatCompletion.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert Python developer and assistant. "
                        "Your task is to clean Python code of any non-Python marks and ensure its correctness. "
                        "Respond only with valid, executable Python code without any syntax errors, "
                        "markdown syntax, comments, or explanations. Ensure the code is ready to run directly "
                        "in a Python interpreter without further modifications."
                        "Ensure the following:\n"
                        "- Correct indentation and formatting as per Python standards.\n"
                        "- Fix any structural or runtime issues in the code.\n"
                        "- Do not include markdown markers like ```python or ```. before the imports of the script or anywhere at the very last bottom of the script as your response script will go directly to the python compiler\n"
                        "- Respond **only with Python code**. Do not include any explanations, introductory text, or comments like 'Here is the cleaned and validated Python code:' or any similar explanations."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Here is the Python code:\n\n{content}\n\n"
                        "- Do not include markdown markers like ```python or ```. before the imports of the script or anywhere at the very last bottom of the script as your response script will go directly to the python compiler\n"
                        "Please clean and validate it to adhere to Python standards. "
                        "Fix indentation issues, ensure `async with` is placed inside valid `async def` functions, "
                        "and ensure all objects are properly initialized. Add robust error handling for common runtime issues. "
                        "Respond only with the cleaned Python code, without any explanations or extraneous text."
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=response_token_buffer,  # Allocate output space
        )
        # Extract and clean the response content
        cleaned_code = response["choices"][0]["message"]["content"].strip()
        logging.info("Formatting completed successfully.")
        return cleaned_code

    except Exception as e:
        logging.error(f"Error processing content: {e}")
        raise RuntimeError(f"Failed to format content. Error: {str(e)}")


def create_notebook(username, notebook_name, content):
    """
    Create a Python script file for the given username and notebook content.
    Cleans and normalizes the content without checking validity.
    """
    # Clean the content minimally
    # content1 = content
    # Use OpenAI to format the content
    # try:
    #     # content = format_with_openai(content1)
    #     # content = ensure_consistent_indentation(content)
    #     logging.info(f"<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>")
    #     # logging.info(f"{content}")

    # except Exception as e:
    #     log_and_emit(f"OpenAI formatting failed: {e}", "error")
    #     return {"error": str(e)}
    
    log_and_emit(f"Creating notebook '{notebook_name}' for user: {username}", "debug")
    try:
        # Ensure the user's environment exists
        notebook_dir = ensure_user_environment(username)
        notebook_path = os.path.join(notebook_dir, f"{notebook_name}")
        temp_notebook_path = f"/tmp/{username}_{notebook_name}"

        # Write the cleaned Python script to a temporary file
        with open(temp_notebook_path, "w") as temp_file:
            temp_file.write(content)

        # Move and set permissions for the notebook
        subprocess.run(["sudo", "mv", temp_notebook_path, notebook_path], check=True)
        subprocess.run(["sudo", "chown", f"{username}:{username}", notebook_path], check=True)

        log_and_emit(f"Notebook created successfully at: {notebook_path}", "debug")
        return {"message": "Notebook created successfully", "path": notebook_path}

    except Exception as e:
        log_and_emit(f"Error creating notebook: {e}", "error")
        return {"error": str(e)}


def generate_user_token(username):
    """Generate a token for a user."""
    log_and_emit(f"Generating token for user: {username}", "debug")
    headers = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        token_response = requests.post(
            f"{JUPYTERHUB_URL}/users/{username}/tokens",
            headers=headers,
            json={"note": f"Token for user {username}"},
        )
        log_and_emit(f"Token generation response: {token_response.status_code} - {token_response.text}", "debug")
        if token_response.status_code == 201:
            return {"token": token_response.json()["token"]}
        return {"error": token_response.text}
    except Exception as e:
        log_and_emit(f"Error during token generation: {e}", "error")
        return {"error": str(e)}

def create_system_user(username):
    """Create a system user if it doesn't exist."""
    try:
        # Check if user already exists
        result = subprocess.run(["id", username], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            # User does not exist, create it
            subprocess.run(["sudo", "useradd", "-m", username], check=True)
            logging.info(f"User {username} created successfully.")
        else:
            logging.info(f"User {username} already exists.")
    except subprocess.CalledProcessError as e:
        logging.error(f"Error creating system user {username}: {e}")
        raise RuntimeError(f"Failed to create user {username}.")

    
def ensure_user_environment(username):
    """Ensure the user's environment is set up."""
    sanitized_username = sanitize_username(username)
    log_and_emit(f"Ensuring user environment for: {sanitized_username}", "debug")
    try:
        # Create the system user if it doesn't exist
        create_system_user(sanitized_username)

        user_home = os.path.join(BASE_NOTEBOOKS_DIR, sanitized_username)
        notebook_dir = os.path.join(user_home, "notebooks")

        if not os.path.exists(user_home):
            subprocess.run(["sudo", "mkdir", "-p", user_home], check=True)
            subprocess.run(["sudo", "chown", "-R", f"{sanitized_username}:{sanitized_username}", user_home], check=True)

        if not os.path.exists(notebook_dir):
            subprocess.run(["sudo", "mkdir", "-p", notebook_dir], check=True)
            subprocess.run(["sudo", "chown", "-R", f"{sanitized_username}:{sanitized_username}", notebook_dir], check=True)

        return notebook_dir
    except subprocess.CalledProcessError as e:
        log_and_emit(f"Error ensuring user environment: {e}", "error")
        raise RuntimeError(f"Error: {e.stderr.decode().strip()}")


# def ensure_user_environment(username):
#     sanitized_username = sanitize_username(username)
#     user_home = os.path.join(BASE_NOTEBOOKS_DIR, sanitized_username)
#     notebook_dir = os.path.join(user_home, "notebooks")

#     if not os.path.exists(user_home):
#         subprocess.run(["sudo", "mkdir", "-p", user_home], check=True)
#         subprocess.run(["sudo", "chown", "-R", f"{sanitized_username}:{sanitized_username}", user_home], check=True)

#     if not os.path.exists(notebook_dir):
#         subprocess.run(["sudo", "mkdir", "-p", notebook_dir], check=True)
#         subprocess.run(["sudo", "chown", "-R", f"{sanitized_username}:{sanitized_username}", notebook_dir], check=True)
    
#     return notebook_dir


def is_server_running(username, token, server_name=""):
    """
    Check if the user's server is already running.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    response = requests.get(f"{JUPYTERHUB_URL}/users/{username}", headers=headers)
    if response.status_code == 200:
        user_info = response.json()
        server = user_info.get("servers", {}).get(server_name, {})
        return server.get("ready", False)
    return False


def start_named_server(username, token, server_name=""):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    if is_server_running(username, token, server_name):
        return {"message": "Server is already running"}

    start_url = f"{JUPYTERHUB_URL}/users/{username}/servers/{server_name}"
    response = requests.post(start_url, headers=headers, json={})

    if response.status_code in [201, 202]:
        socketio.emit("server_status", {"status": "Server requested to start..."}, to=unsanitize_username(username))
    else:
        error_message = f"Failed to start server: {response.text}"
        logging.error(error_message)
        socketio.start_background_task(socketio.emit, "server_status", {"error": error_message}, to=unsanitize_username(username))
        return {"error": error_message}

    while True:
        status_response = requests.get(f"{JUPYTERHUB_URL}/users/{username}", headers=headers)
        if status_response.status_code == 200:
            user_info = status_response.json()
            server = user_info.get("servers", {}).get(server_name, {})
            if server.get("ready", False):
                socketio.start_background_task(socketio.emit, "server_status", {"status": "Server is ready!"}, to=username)
                return {"message": "Server started successfully"}
        time.sleep(1)

def sanitize_username(username):
    """Sanitize username for use as a system user."""
    return username.replace('@', '_at_').replace('.', '_dot_')


@app.route("/test", methods=["GET", "POST", "OPTIONS"])
# @cross_origin()
def test_api():
    """A simple test endpoint for CORS and backend functionality."""
    if request.method == "OPTIONS":
        return make_response(jsonify({"message": "Preflight request success"}), 204)

    if request.method == "POST":
        data = request.json
        return jsonify({
            "message": "POST request received successfully!",
            "received_data": data
        }), 200

    if request.method == "GET":
        return jsonify({
            "message": "GET request received successfully!"
        }), 200


@app.route('/test-socket', methods=['POST'])
def test_socket():
    username = request.json.get('username')
    socketio.emit('execution_status', {"output": "Test message"}, to=unsanitize_username(username))
    return jsonify({"message": "Test message sent"}), 200


# @app.route("/apa/create-jupyter-user", methods=["POST", "OPTIONS"])
# @cross_origin()
# def create_user_endpoint():
#     """
#     Create or fetch a JupyterHub user.
#     This endpoint creates a user or fetches an existing one by username.
#     """

#     if request.method == "OPTIONS":
#         return make_response(jsonify({"message": "Preflight request success"}), 200)

#     data = request.json

#     username = data.get("username")
    
#     logging.info(f"{username} made a create user api request")

#     # Validate input
#     if not username or not isinstance(username, str) or len(username.strip()) < 3:
#         log_and_emit("Invalid username provided", "error")
#         return jsonify({"error": "Username is required and must be at least 3 characters long."}), 400

#     sanitized_username = sanitize_username(username.strip())
#     log_and_emit(f"Processing user creation for: {sanitized_username}", "info")

#     try:
#         # Check if the user already exists in the database
#         with get_db_connection() as conn:
#             with conn.cursor() as cursor:
#                 cursor.execute("SELECT id FROM users WHERE username = %s;", (sanitized_username,))
#                 user = cursor.fetchone()

#                 if user:
#                     user_id = user[0]
#                     log_and_emit(f"User {sanitized_username} already exists with ID {user_id}", "info")
#                 else:
#                     # Insert new user into the database
#                     cursor.execute(
#                         "INSERT INTO users (username) VALUES (%s) RETURNING id;",
#                         (sanitized_username,)
#                     )
#                     user_id = cursor.fetchone()[0]
#                     conn.commit()
#                     log_and_emit(f"User {sanitized_username} created successfully with ID {user_id}", "info")

#         # Generate or fetch token
#         token = generate_user_token(sanitized_username)

#         return jsonify({
#             "message": f"User '{sanitized_username}' processed successfully.",
#             "status": "exists" if user else "created",
#             "token": token,
#             "username": sanitized_username,
#             "user_id": user_id
#         }), 200

#     except Exception as e:
#         log_and_emit(f"Error creating user: {e}", "error")
#         return jsonify({"error": "An error occurred while creating the user. Please try again later."}), 500


def get_user_notebook_status(username):
    """
    Retrieve the status of all notebooks for the given user.
    """
    log_and_emit(f"Fetching notebook statuses for user: {username}", "debug")
    try:
        # Ensure the user environment exists and has correct permissions
        notebook_dir = ensure_user_environment(username)
        # Retrieve all notebooks in the user's directory using `sudo`
        try:
            result = subprocess.run(
                ["sudo", "ls", notebook_dir],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )
            all_notebooks = [
                f.replace(".ipynb", "")
                for f in result.stdout.splitlines()
                if f.endswith(".ipynb")
            ]
        except subprocess.CalledProcessError as e:
            log_and_emit(
                f"Error accessing notebooks for {username}: {e.stderr.strip()}", "error"
            )
            raise RuntimeError(f"Permission denied or error accessing: {notebook_dir}")

        user_running = running_notebooks.get(username, {})
        user_failed = failed_notebooks.get(username, {})

        running_list = [
            {"notebook_name": notebook, "status": "running", "output_window": []}
            for notebook in user_running.keys()
        ]
        failed_list = [
            {
                "notebook_name": notebook,
                "status": "failed",
                "error": error,
                "output_window": [],  # Include any logged output if available
            }
            for notebook, error in user_failed.items()
        ]
        stopped_list = [
            {"notebook_name": notebook, "status": "stopped", "output_window": []}
            for notebook in all_notebooks
            if notebook not in user_running and notebook not in user_failed
        ]

        return {"running": running_list, "failed": failed_list, "stopped": stopped_list}
    except RuntimeError as e:
        log_and_emit(f"Error retrieving notebook statuses: {e}", "error")
        return {"error": str(e)}


def show_statuses_user_notebooks(username):
    """Broadcast the status of notebooks owned by the given user."""
    user_notebooks = running_notebooks.get(username, {})
    # Separate notebooks into running and failed
    logging.info(f"Current user_notebooks for {username}:\n{json.dumps(user_notebooks, default=str, indent=2)}")

    running_list = [
        {"notebook_name": notebook, "status": data["status"]}
        for notebook, data in user_notebooks.items()
        if data["status"] == "running"
    ]
    failed_list = [
        {"notebook_name": notebook, "status": data["status"], "error": data.get("error")}
        for notebook, data in user_notebooks.items()
        if data["status"] == "failed"
    ]
    # Log the current state of user_notebooks
    # Emit statuses
    socketio.emit(
        "user_notebook_statuses",
        {"running": running_list, "failed": failed_list},
        to=unsanitize_username(username)
    )


def update_notebook_status(user_id, notebook_name, status, error_message=None, process_id=None):
    """
    Insert or update notebook status in the database, including process ID.
    Now uses user_id instead of username.
    Returns a status message to confirm success or failure.
    """
    # Ensure the notebook name includes the `.ipynb` extension
    if not notebook_name.endswith(".ipynb"):
        notebook_name += ".ipynb"

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO notebook_statuses (user_id, notebook_name, status, error_message, process_id)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, notebook_name)
                    DO UPDATE SET 
                        status = EXCLUDED.status, 
                        error_message = EXCLUDED.error_message, 
                        process_id = EXCLUDED.process_id;
                """, (user_id, notebook_name, status, error_message, process_id))
                conn.commit()
        # If everything went well, return a success message
        return {"success": True, "message": f"Notebook status updated successfully for {notebook_name}"}
    except Exception as e:
        # Log the error and return a failure message
        logging.error(f"Error updating notebook status for {notebook_name}: {e}")
        return {"success": False, "message": f"Failed to update notebook status for {notebook_name}. Error: {e}"}

def get_notebook_statuses(username):
    """Retrieve all notebook statuses for a user."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # Get the user_id for the given username
            cursor.execute("""
                SELECT id 
                FROM users 
                WHERE username = %s;
            """, (username,))
            user = cursor.fetchone()
            
            if not user:
                return []  # Return an empty list if the user does not exist
            
            user_id = user[0]
            
            # Fetch notebook statuses for the user
            cursor.execute("""
                SELECT notebook_name, status, error_message
                FROM notebook_statuses
                WHERE user_id = %s;
            """, (user_id,))
            return cursor.fetchall()


# Flask Routes and Socket.IO Handlers
@socketio.on("join")
def handle_join(data):
    """Handle a user joining their WebSocket room."""
    username = data.get("username")
    if username:
        sanitized_username = sanitize_username(username)
        join_room(sanitized_username)
        statuses = get_notebook_statuses(sanitized_username)
        running_list = [{"notebook_name": n[0], "status": n[1]} for n in statuses if n[1] == "running"]
        failed_list = [{"notebook_name": n[0], "status": n[1], "error": n[2]} for n in statuses if n[1] == "failed"]
        socketio.emit("user_notebook_statuses", {"running": running_list, "failed": failed_list}, to=sanitized_username)
        
    username = data.get("username")
    
    logging.info(f"{username} made a create user api request")

    # Validate input
    if not username or not isinstance(username, str) or len(username.strip()) < 3:
        log_and_emit("Invalid username provided", "error")
        return jsonify({"error": "Username is required and must be at least 3 characters long."}), 400

    sanitized_username = sanitize_username(username.strip())
    log_and_emit(f"Processing user creation for: {sanitized_username}", "info")

    try:
        # Check if the user already exists in the database
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id FROM users WHERE username = %s;", (sanitized_username,))
                user = cursor.fetchone()

                if user:
                    user_id = user[0]
                    log_and_emit(f"User {sanitized_username} already exists with ID {user_id}", "info")
                else:
                    # Insert new user into the database
                    cursor.execute(
                        "INSERT INTO users (username) VALUES (%s) RETURNING id;",
                        (sanitized_username,)
                    )
                    user_id = cursor.fetchone()[0]
                    conn.commit()
                    log_and_emit(f"User {sanitized_username} created successfully with ID {user_id}", "info")

    except Exception as e:
        log_and_emit(f"Error creating user: {e}", "error")
        return jsonify({"error": "An error occurred while creating the user. Please try again later."}), 500


@socketio.on("disconnect")
def handle_disconnect():
    for room in list(user_rooms):
        leave_room(room)
        user_rooms.discard(room)

def get_user_id(username):
    """Fetch the user_id corresponding to the given username."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            result = cursor.fetchone()
            if result:
                return result[0]
            else:
                raise ValueError(f"User '{username}' does not exist")

@app.route("/apa/run-notebook", methods=["POST", "OPTIONS"])
def run_notebook_endpoint():
    """
    Endpoint to validate, clean, and execute notebook content.
    """
    # Parse the input JSON data
    data = request.get_json(silent=True)
    if not data:
        logging.error("Invalid JSON payload")
        return jsonify({"error": "Invalid JSON payload"}), 400

    # Extract required parameters
    username = data.get("username")
    notebook_name = data.get("notebook_name")
    notebook_nameP = data.get("notebook_name")
    content = data.get("content", "# Notebook created automatically")
    username = sanitize_username(username)

    if not username or not notebook_name:
        logging.error("Missing username or notebook name.")
        return jsonify({"error": "Username and notebook name are required"}), 400

    logging.info(f"Starting notebook execution for user '{username}', notebook '{notebook_name}'.")

    # Fetch the user_id
    user_id = get_user_id(username)

    # Update the notebook status to 'initializing'
    result = update_notebook_status(user_id, notebook_name, "initializing")
    if result["success"]:
        logging.info(f"Notebook status updated: {result['message']}")
    else:
        logging.error(f"Failed to update notebook status: {result['message']}")

    socketio.emit(
        "notebook_status",
        {"notebook_name": notebook_name, "status": "initializing"},
        to=unsanitize_username(username),
    )

    def execute_notebook():
        """
        Execute the notebook and stream logs in real-time.
        """
        try:
            logging.info(f"Starting notebook execution for '{notebook_name}'")

            # Create the notebook
            notebook_result = create_notebook(username, notebook_name, content)
            if "error" in notebook_result:
                message = f"Error creating notebook: {notebook_result['error']}"
                logging.error(message)
                socketio.emit(
                    "execution_log",
                    {"notebook_name": notebook_name, "output": message},
                    to=unsanitize_username(username),
                )
                # Update status and exit early
                update_notebook_status(user_id, notebook_name, "failed", message)
                return

            script_path = notebook_result["path"]
            logging.info(f"Script path: {script_path}")

            # Command to execute the notebook script
            command = ["sudo", "/home/ubuntu/miniconda3/envs/ipy/bin/python", script_path]
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout for unified logs
                text=True,  # Decode bytes to strings automatically
                bufsize=1,  # Line-buffered for real-time output
            )
            logging.info(f"Started subprocess with PID: {process.pid}")

            # Update notebook status to 'running'
            result = update_notebook_status(user_id, notebook_name, "running", process_id=process.pid)
            if result["success"]:
                logging.info(result["message"])
            else:
                logging.error(result["message"])
                socketio.emit(
                    "execution_log",
                    {"notebook_name": notebook_name, "output": f"Error updating status: {result['message']}"},
                    to=unsanitize_username(username),
                )

            socketio.emit(
                "notebook_status",
                {"notebook_name": notebook_name, "status": "running"},
                to=unsanitize_username(username),
            )

            # Stream logs from subprocess in real-time
            buffer = []
            last_emit_time = time.time()
            emit_interval = 0.5  # Emit logs every 0.5 seconds

            logging.info("Streaming output from subprocess:")
            for line in process.stdout:
                if line.strip():  # Only process non-empty lines
                    logging.debug(f"Captured output: {line.strip()}")
                    buffer.append(line.strip())

                # Emit buffered logs to the client
                if len(buffer) >= 10 or (time.time() - last_emit_time) > emit_interval:
                    socketio.emit(
                        "execution_log",
                        {"notebook_name": notebook_name, "output": "\n".join(buffer)},
                        to=unsanitize_username(username),
                    )
                    buffer.clear()
                    last_emit_time = time.time()

            # Flush any remaining logs
            if buffer:
                socketio.emit(
                    "execution_log",
                    {"notebook_name": notebook_name, "output": "\n".join(buffer)},
                    to=unsanitize_username(username),
                )

            # Wait for process completion and log results
            process.wait()
            if process.returncode == 0:
                message = "Script completed successfully."
                logging.info(message)
                socketio.emit(
                    "execution_log",
                    {"notebook_name": notebook_name, "output": message},
                    to=unsanitize_username(username),
                )
                update_notebook_status(user_id, notebook_name, "completed")
            else:
                message = f"Script failed with return code {process.returncode}"
                logging.error(message)
                socketio.emit(
                    "execution_log",
                    {"notebook_name": notebook_name, "output": message},
                    to=unsanitize_username(username),
                )
                update_notebook_status(user_id, notebook_name, "failed", message)

        except Exception as e:
            # Handle unexpected exceptions by logging and emitting them
            message = f"Unexpected error: {str(e)}"
            logging.error(message)
            socketio.emit(
                "execution_log",
                {"notebook_name": notebook_name, "output": message},
                to=unsanitize_username(username),
            )
            update_notebook_status(user_id, notebook_name, "failed", message)
        finally:
            # Notify the frontend that execution is complete
            logging.info(f"Execution process completed for '{notebook_name}'")
            socketio.emit(
                "execution_log",
                {"notebook_name": notebook_name, "output": "Execution process completed."},
                to=unsanitize_username(username),
            )

    # Start the execution in a background thread
    threading.Thread(target=execute_notebook).start()

    # Update status to 'running' in database
    result = update_notebook_status(user_id, notebook_name, "initialising")
    if result["success"]:
        logging.info(f"Notebook status updated: {result['message']}")
    else:
        logging.error(f"Failed to update notebook status: {result['message']}")
    logging.info(f"update_notebook_status Updated as initialising for'{username}'.")

    socketio.emit(
        "notebook_status",
        {"notebook_name": notebook_name, "status": "initialising"},
        to=unsanitize_username(username),
    )

    socketio.emit(
        "user_notebook_statuses",
        {"notebook_name": notebook_name, "status": "initialising"},
        to=unsanitize_username(username),
    )

    # Return an immediate response to the client
    return jsonify({
        "message": "Notebook execution started successfully.",
        "username": username,
        "notebook_name": notebook_name
    }), 200


@app.route("/apa/stop-notebook", methods=["POST", "OPTIONS"])
def stop_notebook():
    """Stop a running notebook by its process ID."""
    data = request.json
    notebook_name = data.get("notebook_name")
    username = data.get("username")
    logging.info(f"User {username} made a request to stop {notebook_name}")

    if not notebook_name or not username:
        return jsonify({"error": "Username and notebook name are required"}), 400

    try:
        # Fetch user_id for the username
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_id_result = cursor.fetchone()

        if not user_id_result:
            return jsonify({"error": f"User '{username}' does not exist"}), 404

        user_id = user_id_result[0]

        # Fetch the process ID from the database
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT process_id, status FROM notebook_statuses
                    WHERE user_id = %s AND notebook_name = %s || '.ipynb' AND status = 'running';
                """, (user_id, notebook_name))
                result = cursor.fetchone()

        if not result:
            return jsonify({"error": f"Notebook '{notebook_name}' is not running"}), 404

        process_id, status = result
        logging.info(f"Retrieved process ID {process_id} for notebook '{notebook_name}'.")

        # Terminate the process
        os.kill(process_id, signal.SIGTERM)
        logging.info(f"Successfully terminated process ID {process_id} for notebook '{notebook_name}'.")

        # Update the status in the database
        result = update_notebook_status(user_id, notebook_name, "stopped")
        if result["success"]:
            logging.info(f"Notebook status updated: {result['message']}")
        else:
            logging.error(f"Failed to update notebook status: {result['message']}")

        # Notify the user via WebSocket
        socketio.emit(
            "notebook_status",
            {"notebook_name": notebook_name, "status": "stopped"},
            to=unsanitize_username(username),
        )

        logging.info(f"Notebook '{notebook_name}' stopped successfully.")
        return jsonify({"message": f"Notebook '{notebook_name}' stopped successfully"}), 200

    except Exception as e:
        error_msg = f"Error stopping notebook: {e}"
        logging.error(error_msg)
        return jsonify({"error": error_msg}), 500


@app.route("/apa/delete-notebook", methods=["POST", "OPTIONS"])
def delete_notebook():
    """Delete a notebook and its associated process."""
    data = request.json
    username = data.get("username")
    notebook_name = data.get("notebook_name")

    logging.info(f"User {username} made /apa/delete-notebook request.")

    if not username or not notebook_name:
        return jsonify({"error": "Username and notebook name are required"}), 400

    try:
        # Fetch user_id for the username
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_id_result = cursor.fetchone()

        if not user_id_result:
            return jsonify({"error": f"User '{username}' does not exist"}), 404

        user_id = user_id_result[0]

        # Fetch process ID and status for the notebook
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT process_id, status FROM notebook_statuses
                    WHERE user_id = %s AND notebook_name = %s;
                """, (user_id, notebook_name))
                result = cursor.fetchone()

        if not result:
            return jsonify({"error": f"Notebook '{notebook_name}' does not exist in records"}), 404

        process_id, status = result

        # Stop the process if it's running
        if status == "running" and process_id:
            try:
                os.kill(process_id, signal.SIGTERM)
                logging.info(f"Stopped running process with ID {process_id}.")
            except Exception as e:
                logging.error(f"Failed to terminate process {process_id}: {e}")

        # Delete the notebook file
        notebook_dir = ensure_user_environment(username)
        notebook_path = os.path.join(notebook_dir, f"{notebook_name}.ipynb")
        if os.path.exists(notebook_path):
            os.remove(notebook_path)
            logging.info(f"Deleted notebook file: {notebook_path}")

        # Delete the entry from the database
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM notebook_statuses
                    WHERE user_id = %s AND notebook_name = %s;
                """, (user_id, notebook_name))
                conn.commit()

        return jsonify({"message": f"Notebook '{notebook_name}' deleted successfully"}), 200

    except Exception as e:
        error_msg = f"Error deleting notebook: {e}"
        logging.error(error_msg)
        return jsonify({"error": error_msg}), 500


if __name__ == "__main__":
    init_db()
    socketio.run(app, host="0.0.0.0", port=5002)
