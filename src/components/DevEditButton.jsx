function DevEditButton({ label = 'Edit', onClick, className = '' }) {
  return (
    <button type="button" className={`dev-edit-button ${className}`.trim()} onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Zm-8.69 10.6-.38 1.83 1.83-.38 8.82-8.82a.75.75 0 0 0-1.06-1.06l-8.82 8.82Z" fill="currentColor" />
      </svg>
    </button>
  );
}

export default DevEditButton;
