export type Clock = () => Date;

export const currentDate: Clock = () => new Date();

export const currentISO = (clock: Clock = currentDate): string => clock().toISOString();

export const folioDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
};
