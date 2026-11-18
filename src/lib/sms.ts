/**
 * Sends SMS through Africa's Talking when AT_USERNAME and AT_API_KEY are set.
 * https://developers.africastalking.com/docs/sms/sending/bulk
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) {
    throw new Error("SMS is not configured (set AT_USERNAME and AT_API_KEY)");
  }
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const body = new URLSearchParams({ username, to, message });
  if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);
  const res = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`SMS failed with status ${res.status}`);
}
