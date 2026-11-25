export type MessengerHandles = { whatsapp: string; telegram: string; instagram: string };

function withText(url: string, message?: string) {
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

export function whatsappUrl(phone: string, message?: string) {
  return withText(`https://wa.me/${phone.replace(/\D/g, "")}`, message);
}

export function telegramUrl(username: string, message?: string) {
  return withText(`https://t.me/${username}`, message);
}

export function instagramUrl(username: string) {
  return `https://instagram.com/${username}`;
}

export function hasMessenger({ whatsapp, telegram }: MessengerHandles) {
  return Boolean(whatsapp || telegram);
}
