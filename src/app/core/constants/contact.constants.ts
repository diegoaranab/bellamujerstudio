export const BELLA_MUJER_WHATSAPP_NUMBER = '522381117950';

export const BELLA_MUJER_LOCATION_LABEL = 'Tehuacán, Puebla';

export function buildBellaMujerWhatsAppUrl(message?: string): string {
  const baseUrl = `https://wa.me/${BELLA_MUJER_WHATSAPP_NUMBER}`;

  if (!message) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}
