const THUMBS = import.meta.glob("../assets/thumbs/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** File name of a panel's thumbnail; `:` is not allowed in file names everywhere. */
export const thumbName = (type: string, dark: boolean) =>
  `${type.replace(/:/g, "-")}.${dark ? "dark" : "light"}.webp`;

/** URL of panel `type`'s thumbnail in the picker, if `pnpm thumbnails` made one. */
export function thumbUrl(type: string, dark: boolean): string | undefined {
  return THUMBS[`../assets/thumbs/${thumbName(type, dark)}`];
}
