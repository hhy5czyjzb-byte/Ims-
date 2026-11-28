/** Paginering van lange lijsten (bijv. 600 milieuaspecten): `?pagina=2`, of `?pagina=alle` (afdrukken, alles doorzoeken). */
export const PAGE_SIZE = 100;

export function paginate<T>(items: T[], pageParam: string | undefined, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  if (pageParam === "alle") return { items, page: 0, pages, all: true, from: items.length ? 1 : 0, to: items.length };
  const page = Math.min(pages, Math.max(1, Number(pageParam) || 1));
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page, pages, all: false, from: slice.length ? start + 1 : 0, to: start + slice.length };
}
