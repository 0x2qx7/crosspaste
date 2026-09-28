const form = document.getElementById('access-form');
const errorMessage = document.getElementById('access-error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;

  const token = document.getElementById('access-token').value;
  try {
    const response = await fetch('/api/access/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      window.location.href = '/';
      return;
    }

    const body = await response.json().catch(() => null);
    errorMessage.textContent = body?.error?.message || 'Не удалось проверить ключ доступа.';
    errorMessage.hidden = false;
  } catch {
    errorMessage.textContent = 'Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.';
    errorMessage.hidden = false;
  }
});
