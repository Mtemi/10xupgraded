export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private auth2: any = null;

  private constructor() {}

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  async initialize(): Promise<void> {
    if (this.auth2) return;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: this.handleCredentialResponse.bind(this),
        });
        this.auth2 = google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          scope: 'email profile',
        });
        resolve();
      };
      document.body.appendChild(script);
    });
  }

  private handleCredentialResponse(response: any) {
    const credential = response.credential;
    // Decode the JWT token
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const { sub, email, name, picture } = JSON.parse(jsonPayload);
    return {
      id: sub,
      email,
      name,
      picture
    };
  }

  async signIn(): Promise<GoogleUser> {
    return new Promise((resolve, reject) => {
      try {
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            reject(new Error('Google Sign In was not displayed'));
          }
        });
        
        // The result will be handled by the callback set in initialize()
        google.accounts.id.prompt();
      } catch (error) {
        reject(error);
      }
    });
  }

  async signOut(): Promise<void> {
    google.accounts.id.disableAutoSelect();
  }
}