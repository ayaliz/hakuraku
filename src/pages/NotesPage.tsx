import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface NoteEntry {
    id: string;
    title: string;
    filename: string;
    date: string;
    description: string;
}

const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--haku-bg-2)',
    borderRadius: 'var(--haku-radius)',
    padding: '20px',
    boxShadow: 'var(--haku-shadow)',
    border: '1px solid var(--haku-border)',
    cursor: 'pointer',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
};

const cardHoverStyle: React.CSSProperties = {
    ...cardStyle,
    borderColor: 'var(--haku-accent)',
    boxShadow: '0 4px 20px rgba(102,126,234,0.2)',
};

function NoteCard({ entry, onClick }: { entry: NoteEntry; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            style={hovered ? cardHoverStyle : cardStyle}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{ fontSize: '0.8rem', color: 'var(--haku-text-muted)', marginBottom: 6 }}>{entry.date}</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--haku-text-primary)', fontSize: '1.1rem' }}>{entry.title}</h3>
            <p style={{ margin: 0, color: 'var(--haku-text-secondary)', fontSize: '0.9rem' }}>{entry.description}</p>
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
        return <div style={{ padding: '40px 20px', color: 'var(--haku-text-secondary)' }}>Loading notes…</div>;
    }

    if (error) {
        return <div style={{ padding: '40px 20px', color: '#f87171' }}>Error: {error}</div>;
    }

    if (selected) {
        return (
            <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto' }}>
                <button
                    onClick={backToList}
                    style={{
                        background: 'none',
                        border: '1px solid var(--haku-border)',
                        borderRadius: 'var(--haku-radius)',
                        color: 'var(--haku-text-secondary)',
                        padding: '6px 14px',
                        cursor: 'pointer',
                        marginBottom: 24,
                        fontSize: '0.9rem',
                    }}
                >
                    ← Back to Notes
                </button>

                {mdLoading ? (
                    <div style={{ color: 'var(--haku-text-muted)' }}>Loading…</div>
                ) : (
                    <div style={{
                        backgroundColor: 'var(--haku-bg-2)',
                        borderRadius: 'var(--haku-radius)',
                        padding: '28px 32px',
                        boxShadow: 'var(--haku-shadow)',
                        border: '1px solid var(--haku-border)',
                        lineHeight: 1.7,
                    }}>
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex as any]}
                            components={{
                                h1: ({ children }) => <h1 style={{ borderBottom: '1px solid var(--haku-border)', paddingBottom: 10, marginBottom: 20, color: 'var(--haku-text-primary)' }}>{children}</h1>,
                                h2: ({ children }) => <h2 style={{ color: 'var(--haku-text-primary)', marginTop: 32 }}>{children}</h2>,
                                h3: ({ children }) => <h3 style={{ color: 'var(--haku-text-primary)' }}>{children}</h3>,
                                p: ({ children }) => <p style={{ color: 'var(--haku-text-secondary)' }}>{children}</p>,
                                li: ({ children }) => <li style={{ color: 'var(--haku-text-secondary)', marginBottom: 4 }}>{children}</li>,
                                strong: ({ children }) => <strong style={{ color: 'var(--haku-text-primary)' }}>{children}</strong>,
                                a: ({ href, children }) => {
                                    const resolved = href?.startsWith('attachments/')
                                        ? `${import.meta.env.BASE_URL}notes/${href}`
                                        : href;
                                    return <a href={resolved} target="_blank" rel="noreferrer" style={{ color: 'var(--haku-accent)' }}>{children}</a>;
                                },
                                table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 12, marginBottom: 12 }}>{children}</table>,
                                th: ({ children }) => <th style={{ border: '1px solid var(--haku-border)', padding: '6px 12px', color: 'var(--haku-text-primary)', textAlign: 'center', backgroundColor: 'var(--haku-bg-3, rgba(255,255,255,0.05))' }}>{children}</th>,
                                td: ({ children }) => <td style={{ border: '1px solid var(--haku-border)', padding: '5px 12px', color: 'var(--haku-text-secondary)', textAlign: 'center' }}>{children}</td>,
                                code: ({ children, className }) => {
                                    const isBlock = className?.startsWith('language-');
                                    return isBlock ? (
                                        <code style={{
                                            display: 'block',
                                            backgroundColor: '#1e1e1e',
                                            color: '#a5d6a7',
                                            padding: '10px 14px',
                                            borderRadius: 4,
                                            fontFamily: "'Consolas', 'Monaco', monospace",
                                            fontSize: '0.88rem',
                                            overflowX: 'auto',
                                        }}>{children}</code>
                                    ) : (
                                        <code style={{
                                            backgroundColor: 'rgba(255,255,255,0.08)',
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            fontFamily: "'Consolas', 'Monaco', monospace",
                                            fontSize: '0.88em',
                                            color: '#a5d6a7',
                                        }}>{children}</code>
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
        <div style={{ padding: '20px', maxWidth: 900, margin: '0 auto' }}>
            <div style={{ borderBottom: '1px solid var(--haku-border)', paddingBottom: 16, marginBottom: 28 }}>
                <p style={{ margin: '6px 0 0', color: 'var(--haku-text-secondary)', fontSize: '0.9rem' }}>
                    Some notes on stuff I come across while looking at this game.
                </p>
            </div>

            {notes.length === 0 ? (
                <p style={{ color: 'var(--haku-text-muted)' }}>No notes yet.</p>
            ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                    {notes.map(entry => (
                        <NoteCard key={entry.id} entry={entry} onClick={() => openNote(entry)} />
                    ))}
                </div>
            )}
        </div>
    );
}
