import { useEffect, useState } from 'react';
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
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex as any]}
                            components={{
                                a: ({ href, children }) => {
                                    const resolved = href?.startsWith('attachments/')
                                        ? `${import.meta.env.BASE_URL}notes/${href}`
                                        : href;
                                    return <a href={resolved} target="_blank" rel="noreferrer">{children}</a>;
                                },
                                table: ({ children }) => <div className="table-wrapper"><table>{children}</table></div>,
                                code: ({ children, className }) => {
                                    const isBlock = className?.startsWith('language-');
                                    return isBlock ? (
                                        <code className="language-code">{children}</code>
                                    ) : (
                                        <code className="inline-code">{children}</code>
                                    );
                                },
                            }}
                        >
                            {markdown}
                        </ReactMarkdown>
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
