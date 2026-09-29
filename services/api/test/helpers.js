export async function createTestSession(base, email = "test@example.com") {
  const response = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test password with enough length" })
  });
  if (response.status !== 201) throw new Error(`Test account creation failed (${response.status}).`);
  return (await response.json()).token;
}
