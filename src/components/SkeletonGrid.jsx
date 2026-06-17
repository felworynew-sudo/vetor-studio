function SkeletonGrid({ label }) {
  return (
    <section className="card-grid" aria-label={label}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="skeleton-card surface-panel">
          <div className={index % 3 === 0 ? 'skeleton-media square-ratio' : 'skeleton-media video-ratio'} />
          <div className="skeleton-lines">
            <span className="skeleton-line long" />
            <span className="skeleton-line medium" />
          </div>
        </div>
      ))}
    </section>
  );
}

export default SkeletonGrid;
