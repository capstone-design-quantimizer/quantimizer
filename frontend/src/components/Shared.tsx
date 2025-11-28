import React from 'react';

export const Modal = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
    <div className="modal__backdrop" onClick={onClose}>
        <div className="modal__content" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
                <span>{title}</span>
                <button className="btn--ghost" onClick={onClose} style={{ fontSize: '1.25rem' }}>&times;</button>
            </div>
            <div className="modal__body">{children}</div>
        </div>
    </div>
);

export const Pagination = ({ current, total, limit, onChange }: { current: number, total: number, limit: number, onChange: (p: number) => void }) => {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    if (totalPages <= 1) return null;
    return (
        <div className="pagination">
            <button className="btn--icon" disabled={current === 1} onClick={() => onChange(current - 1)}>‹</button>
            {pages.map(p => (
                <button key={p} className={`page-num ${p === current ? 'active' : ''}`} onClick={() => onChange(p)}>
                    {p}
                </button>
            ))}
            <button className="btn--icon" disabled={current === totalPages} onClick={() => onChange(current + 1)}>›</button>
        </div>
    );
};