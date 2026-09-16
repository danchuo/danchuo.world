/**
 * Addresses for actions on an Instagram post. NOT EVERYTHING CAN BE A LINK there: no public URL
 * likes, saves or opens the share sheet, and inventing a plausible one would 404 or, worse, hit
 * someone else's post. Like and save open the post; sharing copies the link. PRD §5.17
 */
const HOST = "https://www.instagram.com";

/** The owner's profile. The API sends the handle without an "@", but we strip one just in case. */
export function instagramProfileUrl(username: string): string {
  return `${HOST}/${username.trim().replace(/^@+/, "")}/`;
}

/**
 * A post's comments. Built through the URL's PATH rather than string concatenation: a permalink
 * may carry a query tail, and naive appending would attach the segment to the parameters. If the
 * address cannot be parsed, the permalink is returned as is: opening the post beats guessing.
 */
export function instagramCommentsUrl(permalink: string): string {
  try {
    const url = new URL(permalink);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/comments/`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return permalink;
  }
}
