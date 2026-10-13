export async function signOut() {
  const { csrfToken } = await fetch('/api/auth/csrf').then((r) => r.json());
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/auth/signout';
  for (const [name, value] of Object.entries({ csrfToken, callbackUrl: '/' })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
