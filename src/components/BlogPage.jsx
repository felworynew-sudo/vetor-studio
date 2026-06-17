import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import defaultSectionCopy from '../data/sectionCopy';
import { formatDate, withBase } from '../utils/format';
import { getOptimizedImageSrc } from '../utils/responsiveImages';

function BlogPage({ language, posts, tagsMap, sectionCopy, studioEnabled = false, onEdit, onCreatePost, onEditPost, onOpenPost }) {
  const copy = {
    ...(defaultSectionCopy.blog[language] ?? defaultSectionCopy.blog.ru),
    ...(sectionCopy?.[language] || {}),
  };
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const descriptionKey = language === 'ru' ? 'ruDescription' : 'enDescription';

  return (
    <section className="section-page">
      <div className="section-page-head surface-panel">
        {studioEnabled && onEdit ? <DevEditButton label="Edit blog" onClick={onEdit} className="section-edit-button" /> : null}
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.text}</p>
        {studioEnabled && onCreatePost ? (
          <div className="section-page-actions">
            <button type="button" className="cta-button primary" onClick={onCreatePost}>
              {language === 'ru' ? 'Добавить публикацию' : 'Add post'}
            </button>
          </div>
        ) : null}
      </div>

      {posts.length > 0 ? (
        <div className="blog-grid">
          {posts.map((post, index) => (
            <article key={post.id} className="blog-card" onClick={() => onOpenPost(post)}>
              {studioEnabled && onEditPost ? (
                <DevEditButton
                  label={language === 'ru' ? 'Редактировать публикацию' : 'Edit post'}
                  className="blog-card-edit-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditPost(post);
                  }}
                />
              ) : null}
              <button type="button" className="blog-card-hitbox" aria-label={`${copy.open}: ${post[titleKey]}`}>
                <div className="blog-cover">
                  <ImageWithFallback
                    src={getOptimizedImageSrc(post.cover || '/blog/pdf-cover.svg', 960)}
                    fallback={withBase('/blog/pdf-cover.svg')}
                    alt={post[titleKey]}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                  />
                </div>
                <div className="blog-card-content">
                  <span>{formatDate(post.createdAt, language)}</span>
                  <h2>{post[titleKey]}</h2>
                  <p>{post[descriptionKey]}</p>
                  {post.tags?.length ? (
                    <div className="blog-tags">
                      {post.tags.map((tagSlug) => {
                        const tag = tagsMap?.get(tagSlug);
                        return (
                          <span key={tagSlug} className="tag-pill modal-pill">
                            {tag ? tag[language] : tagSlug}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state surface-panel">
          <h2>{copy.empty}</h2>
        </div>
      )}
    </section>
  );
}

export default BlogPage;
