// ~/services/GoogleClient.ts
export class GoogleClient {
  private static instance: GoogleClient;
  private initialized = false;

  private constructor() {}

  static getInstance(): GoogleClient {
    if (!GoogleClient.instance) {
      GoogleClient.instance = new GoogleClient();
    }
    return GoogleClient.instance;
  }

  async loadGoogleScript(apiUrl: string): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = apiUrl;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        this.initialized = true;
        resolve();
      };

      script.onerror = (error) => {
        console.error("[ERROR] Failed to load Google client script:", error);
        reject(new Error("Failed to load Google client script"));
      };

      document.head.appendChild(script);
    });
  }

  initializeGoogleSignIn(
    clientId: string,
    callback: (response: any) => void,
    buttonElement: HTMLElement | null,
    buttonConfig: Record<string, any>
  ): void {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      console.error("[ERROR] Google API not loaded. Ensure the script is included.");
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup",
    });

    if (buttonElement) {
      window.google.accounts.id.renderButton(buttonElement, buttonConfig);
    } else {
      console.error("[ERROR] Google button element not found for rendering.");
    }
  }
}
