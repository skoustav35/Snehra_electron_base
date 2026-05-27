export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      // Decode the name and value, and join value parts in case it contains '='
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);
  return cookies.apiKeys ? JSON.parse(cookies.apiKeys) : {};
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);
  return cookies.providers ? JSON.parse(cookies.providers) : {};
}

export async function getSecureApiKeys(cookieHeader: string | null): Promise<Record<string, string>> {
  const cookies = parseCookies(cookieHeader);
  const firebaseIdToken = cookies.firebaseIdToken;
  const firebaseUid = cookies.firebaseUid;

  const apiKeys: Record<string, string> = {};

  if (!firebaseIdToken || !firebaseUid) {
    return apiKeys;
  }

  try {
    const jwtParts = firebaseIdToken.split('.');
    if (jwtParts.length < 2) return apiKeys;
    const payload = JSON.parse(atob(jwtParts[1]));
    const projectId = payload.aud;

    const apiKeysRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${firebaseUid}/settings/api_keys`, {
      headers: { Authorization: `Bearer ${firebaseIdToken}` }
    });
    
    if (apiKeysRes.ok) {
      const apiKeysData = await apiKeysRes.json();
      if (apiKeysData.fields) {
        for (const [provider, valueObj] of Object.entries(apiKeysData.fields)) {
          apiKeys[provider] = (valueObj as any).stringValue || '';
        }
      }
    }
  } catch (error) {
    console.error('Failed to securely fetch API keys:', error);
  }

  return apiKeys;
}
