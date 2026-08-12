export function stripPhoneSuffix(phone: string): string {
  return (phone || "").replace("@c.us", "").replace("@s.whatsapp.net", "").split("@")[0];
}
