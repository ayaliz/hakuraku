export interface NoteEntry {
    id: string;
    title: string;
    filename: string;
    date: string;
    description: string;
}

export function sortNotesNewestFirst(notes: NoteEntry[]): NoteEntry[] {
    return [...notes].sort((a, b) => b.date.localeCompare(a.date));
}

export function formatNoteDate(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) return date;

    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
}
