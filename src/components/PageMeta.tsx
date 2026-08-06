/**
 * Per-route <title> / <meta> for the SPA.
 *
 * React 19 hoists <title>, <meta> and <link> rendered anywhere in the tree into <head>, so this
 * needs no helmet library and no SSR. Without it every route serves the one title in index.html,
 * which makes the pages compete with each other in search results and look identical there.
 */
export default function PageMeta({
    title,
    description,
    noIndex,
    appendSiteName = true,
}: {
    title: string;
    description?: string;
    noIndex?: boolean;
    /** Set false when the title is already the site name, to avoid "Hakuraku - Hakuraku". */
    appendSiteName?: boolean;
}) {
    const fullTitle = appendSiteName ? `${title} - Hakuraku` : title;
    return (
        <>
            <title>{fullTitle}</title>
            <meta property="og:title" content={fullTitle} />
            {description && <meta name="description" content={description} />}
            {description && <meta property="og:description" content={description} />}
            {noIndex && <meta name="robots" content="noindex" />}
        </>
    );
}
