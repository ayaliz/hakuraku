import { Fragment, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './NotesPage.css';

interface NoteEntry {
    id: string;
    title: string;
    filename: string;
    date: string;
    description: string;
}

function NoteCard({ entry, onClick }: { entry: NoteEntry; onClick: () => void }) {
    return (
        <div
            className="np-card"
            onClick={onClick}
        >
            <div className="np-card-date">{entry.date}</div>
            <h3 className="np-card-title">{entry.title}</h3>
            <p className="np-card-desc">{entry.description}</p>
        </div>
    );
}

const markdownComponents = {
    a: ({ href, children }: any) => {
        const resolved = href?.startsWith('attachments/')
            ? `${import.meta.env.BASE_URL}notes/${href}`
            : href;
        return <a href={resolved} target="_blank" rel="noreferrer">{children}</a>;
    },
    img: ({ src, alt }: any) => {
        const resolved = src?.startsWith('attachments/')
            ? `${import.meta.env.BASE_URL}notes/${src}`
            : src;
        return <img src={resolved} alt={alt ?? ''} />;
    },
    table: ({ children }: any) => <div className="table-wrapper"><table>{children}</table></div>,
    code: ({ children, className }: any) => {
        const isBlock = className?.startsWith('language-');
        return isBlock ? (
            <code className="language-code">{children}</code>
        ) : (
            <code className="inline-code">{children}</code>
        );
    },
};

function MarkdownBlock({ children }: { children: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex as any]}
            components={markdownComponents}
        >
            {children}
        </ReactMarkdown>
    );
}

function renderMarkdownWithDetails(markdown: string) {
    const lines = markdown.split(/\r?\n/);
    const rendered: ReactElement[] = [];
    let buffer: string[] = [];
    let key = 0;

    const flushBuffer = () => {
        if (buffer.length === 0) return;
        rendered.push(<MarkdownBlock key={`md-${key++}`}>{buffer.join('\n')}</MarkdownBlock>);
        buffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const detailsMatch = lines[i].match(/^:::details\s+(.+)$/);
        if (!detailsMatch) {
            buffer.push(lines[i]);
            continue;
        }

        flushBuffer();
        const summary = detailsMatch[1].trim();
        const detailLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== ':::') {
            detailLines.push(lines[i]);
            i++;
        }

        rendered.push(
            <details className="np-md-details" key={`details-${key++}`}>
                <summary>{summary}</summary>
                <div className="np-md-details-body">
                    <MarkdownBlock>{detailLines.join('\n')}</MarkdownBlock>
                </div>
            </details>
        );
    }

    flushBuffer();
    return rendered.map((node, index) => <Fragment key={`frag-${index}`}>{node}</Fragment>);
}

export default function NotesPage() {
    const { noteId } = useParams<{ noteId?: string }>();
    const navigate = useNavigate();
    const [notes, setNotes] = useState<NoteEntry[]>([]);
    const [selected, setSelected] = useState<NoteEntry | null>(null);
    const [markdown, setMarkdown] = useState('');
    const [loading, setLoading] = useState(true);
    const [mdLoading, setMdLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(import.meta.env.BASE_URL + 'notes/manifest.json')
            .then(r => {
                if (!r.ok) throw new Error(`Failed to load manifest: ${r.status}`);
                return r.json();
            })
            .then((data: NoteEntry[]) => {
                setNotes(data);
                setLoading(false);
                if (noteId) {
                    const entry = data.find((n: NoteEntry) => n.id === noteId);
                    if (entry) openNote(entry, false);
                }
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function openNote(entry: NoteEntry, pushHistory = true) {
        setSelected(entry);
        setMdLoading(true);
        if (pushHistory) navigate(`/notes/${entry.id}`);
        fetch(import.meta.env.BASE_URL + 'notes/' + entry.filename)
            .then(r => {
                if (!r.ok) throw new Error(`Failed to load note: ${r.status}`);
                return r.text();
            })
            .then(text => {
                setMarkdown(text);
                setMdLoading(false);
            })
            .catch(err => {
                setMarkdown(`**Error loading note:** ${err.message}`);
                setMdLoading(false);
            });
    }

    function backToList() {
        setSelected(null);
        setMarkdown('');
        navigate('/notes');
    }

    if (loading) {
        return <div className="np-loading">Loading notes…</div>;
    }

    if (error) {
        return <div className="np-error">Error: {error}</div>;
    }

    if (selected) {
        return (
            <div className="np-content-wrapper">
                <button
                    onClick={backToList}
                    className="np-back-btn"
                >
                    ← Back to Notes
                </button>

                {mdLoading ? (
                    <div className="np-md-loading">Loading…</div>
                ) : (
                    <div className="np-md-container">
                        {renderMarkdownWithDetails(markdown)}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="np-container">
            <div className="np-header">
                <p className="np-header-text">
                    Some notes on stuff I come across while looking at this game.
                </p>
            </div>

            {notes.length === 0 ? (
                <p className="np-empty">No notes yet.</p>
            ) : (
                <div className="np-grid">
                    {notes.map(entry => (
                        <NoteCard key={entry.id} entry={entry} onClick={() => openNote(entry)} />
                    ))}
                </div>
            )}
        </div>
    );
}
