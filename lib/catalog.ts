export interface Genre {
  id: string;
  label: string;
}

export interface Country {
  code: string;
  label: string;
}

export const GENRES: Genre[] = [
  { id: "all", label: "Todos" },
  { id: "14", label: "Pop" },
  { id: "21", label: "Rock" },
  { id: "18", label: "Hip-Hop" },
  { id: "17", label: "Dance" },
  { id: "12", label: "Latin" },
  { id: "15", label: "R&B / Soul" },
  { id: "7", label: "Electrónica" },
  { id: "11", label: "Jazz" },
  { id: "6", label: "Country" },
  { id: "5", label: "Clásica" },
  { id: "24", label: "Reggae" },
  { id: "20", label: "Alternativa" },
];

export const COUNTRIES: Country[] = [
  { code: "ar", label: "Argentina" },
  { code: "us", label: "Internacional" },
];

export function genreLabel(id: string): string {
  return GENRES.find((g) => g.id === id)?.label ?? "Música";
}

export function countryLabel(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code.toUpperCase();
}
