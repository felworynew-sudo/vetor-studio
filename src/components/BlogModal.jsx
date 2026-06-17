import { useRef } from 'react';
import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import { withBase } from '../utils/format';
import { getOptimizedImageSrc } from '../utils/responsiveImages';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const blogModalText = {
  ru: {
    close: 'Закрыть',
    empty: 'В публикации пока нет блоков.',
    edit: 'Редактировать публикацию',
    backToBlog: 'Вернуться к блогу',
  },
  en: {
    close: 'Close',
    empty: 'This post has no blocks yet.',
    edit: 'Edit post',
    backToBlog: 'Back to blog',
  },
};

function localizedBlockValue(block, language, key) {
  const prefix = language === 'ru' ? 'ru' : 'en';
  const localizedKey = `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
  return block[localizedKey] || block[key] || '';
}

function normalizeTableSize(value, fallback, min = 1, max = 8) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function ensureTableCells(cells, rows, columns) {
  const source = Array.isArray(cells) ? cells : [];

  return Array.from({ length: rows }, (_, rowIndex) => {
    const sourceRow = Array.isArray(source[rowIndex]) ? source[rowIndex] : [];
    return Array.from({ length: columns }, (_, columnIndex) => String(sourceRow[columnIndex] || ''));
  });
}

function legacySectionsToBlocks(post, language) {
  const sections = post[language === 'ru' ? 'ruSections' : 'enSections'] || [];
  return sections.map((section, index) => ({
    id: `${post.id}-legacy-${index}`,
    type: 'text',
    text: section,
    size: index === 0 ? 'hero' : 'body',
    bold: index === 0,
  }));
}

function getPostBlocks(post, language) {
  if (post.blocks?.length) {
    return post.blocks;
  }

  return legacySectionsToBlocks(post, language);
}

function renderTextBlock(block, language, key) {
  const text = localizedBlockValue(block, language, 'text');
  const Tag = block.size === 'hero' ? 'h3' : 'p';

  if (!text) {
    return null;
  }

  const content = block.linkUrl ? (
    <a href={block.linkUrl} target="_blank" rel="noreferrer" className={block.linkStyle === 'button' ? 'blog-reader-inline-button' : undefined}>
      {text}
    </a>
  ) : text;

  return (
    <article key={key} className={`blog-reader-text ${block.size || 'body'} ${block.bold ? 'is-bold' : ''} ${block.italic ? 'is-italic' : ''} ${block.accent ? 'is-accent' : ''}`}>
      <Tag>{content}</Tag>
    </article>
  );
}

function renderLinkedText(block, text) {
  if (!block.linkUrl) {
    return text;
  }

  return (
    <a href={block.linkUrl} target="_blank" rel="noreferrer" className={block.linkStyle === 'button' ? 'blog-reader-inline-button' : undefined}>
      {text}
    </a>
  );
}

function renderTextPairBlock(headingBlock, bodyBlock, language, key) {
  const headingText = localizedBlockValue(headingBlock, language, 'text');
  const bodyText = localizedBlockValue(bodyBlock, language, 'text');
  const HeadingTag = headingBlock.size === 'hero' ? 'h3' : 'p';

  if (!headingText && !bodyText) {
    return null;
  }

  return (
    <article key={key} className={`blog-reader-text blog-reader-text-group ${headingBlock.italic ? 'is-italic' : ''}`}>
      {headingText ? (
        <HeadingTag className={`blog-reader-heading ${headingBlock.bold ? 'is-bold' : ''} ${headingBlock.accent ? 'is-accent' : ''}`}>
          {renderLinkedText(headingBlock, headingText)}
        </HeadingTag>
      ) : null}
      {bodyText ? <p className={`${bodyBlock.italic ? 'is-italic' : ''} ${bodyBlock.accent ? 'is-accent' : ''}`}>{renderLinkedText(bodyBlock, bodyText)}</p> : null}
    </article>
  );
}

function renderImageBlock(block, language, title, key) {
  const caption = localizedBlockValue(block, language, 'caption');
  const alt = localizedBlockValue(block, language, 'alt') || caption || title;

  return (
    <figure key={key} className={`blog-reader-image ${block.ratio || 'wide'}`}>
      <ImageWithFallback src={getOptimizedImageSrc(block.src, 1280)} fallback={withBase('/blog/pdf-cover.svg')} alt={alt} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function renderCarouselBlock(block, language, title, key) {
  const caption = localizedBlockValue(block, language, 'caption');

  return (
    <figure key={key} className="blog-reader-carousel">
      <div className="blog-reader-carousel-track">
        {(block.images || []).map((image, index) => (
          <div key={`${image.src}-${index}`} className={`blog-reader-carousel-slide ${image.ratio || 'wide'}`}>
            <ImageWithFallback
              src={getOptimizedImageSrc(image.src, 960)}
              fallback={withBase('/blog/pdf-cover.svg')}
              alt={image[language === 'ru' ? 'ruAlt' : 'enAlt'] || title}
            />
          </div>
        ))}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function renderBeforeAfterBlock(block, language, title, key) {
  const caption = localizedBlockValue(block, language, 'caption');
  const beforeLabel = (block[language === 'ru' ? 'ruBeforeLabel' : 'enBeforeLabel'] || '').trim();
  const afterLabel = (block[language === 'ru' ? 'ruAfterLabel' : 'enAfterLabel'] || '').trim();

  return (
    <figure key={key} className="blog-reader-before-after">
      <div className="blog-reader-before-after-grid">
        <div>
          <ImageWithFallback src={getOptimizedImageSrc(block.beforeSrc || block.afterSrc, 960)} fallback={withBase('/blog/pdf-cover.svg')} alt={beforeLabel || title} />
          {beforeLabel ? <span>{beforeLabel}</span> : null}
        </div>
        <div>
          <ImageWithFallback src={getOptimizedImageSrc(block.afterSrc || block.beforeSrc, 960)} fallback={withBase('/blog/pdf-cover.svg')} alt={afterLabel || title} />
          {afterLabel ? <span>{afterLabel}</span> : null}
        </div>
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function renderTableBlock(block, language, key) {
  const caption = localizedBlockValue(block, language, 'caption');
  const rows = normalizeTableSize(block.rows, 3);
  const columns = normalizeTableSize(block.columns, 3);
  const cells = ensureTableCells(language === 'ru' ? block.ruCells : block.enCells, rows, columns);
  const className = `blog-reader-table ${block.showHorizontal === false ? 'no-horizontal' : ''} ${block.showVertical === false ? 'no-vertical' : ''}`;

  return (
    <figure key={key} className={className.trim()}>
      <table>
        <tbody>
          {cells.map((row, rowIndex) => (
            <tr key={`reader-row-${rowIndex}`}>
              {row.map((cell, columnIndex) => (
                <td key={`reader-cell-${rowIndex}-${columnIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function renderReaderBlocks(blocks, language, title) {
  const renderedBlocks = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1];
    const key = block.id || `${block.type}-${index}`;

    if (
      block.type === 'text'
      && block.bold
      && nextBlock?.type === 'text'
      && !nextBlock.bold
    ) {
      renderedBlocks.push(renderTextPairBlock(block, nextBlock, language, `${key}-pair`));
      index += 1;
      continue;
    }

    if (block.type === 'image') {
      renderedBlocks.push(renderImageBlock(block, language, title, key));
      continue;
    }

    if (block.type === 'carousel') {
      renderedBlocks.push(renderCarouselBlock(block, language, title, key));
      continue;
    }

    if (block.type === 'beforeAfter') {
      renderedBlocks.push(renderBeforeAfterBlock(block, language, title, key));
      continue;
    }

    if (block.type === 'table') {
      renderedBlocks.push(renderTableBlock(block, language, key));
      continue;
    }

    renderedBlocks.push(renderTextBlock(block, language, key));
  }

  return renderedBlocks;
}

function BlogModal({ post, language, studioEnabled = false, onEdit, onClose }) {
  const modalRef = useRef(null);
  useModalAccessibility({ isOpen: Boolean(post), modalRef, onClose });

  if (!post) {
    return null;
  }

  const copy = blogModalText[language] ?? blogModalText.ru;
  const title = post[language === 'ru' ? 'ruTitle' : 'enTitle'];
  const description = post[language === 'ru' ? 'ruDescription' : 'enDescription'];
  const blocks = getPostBlocks(post, language);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section ref={modalRef} className="blog-reader-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar blog-reader-topbar">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {studioEnabled && onEdit ? <DevEditButton label={copy.edit} onClick={onEdit} className="modal-edit-button" /> : null}
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="blog-reader-feed">
          {blocks.length === 0 ? <div className="blog-reader-note">{copy.empty}</div> : null}
          {renderReaderBlocks(blocks, language, title)}
          <button type="button" className="blog-reader-back-button" onClick={onClose}>
            {copy.backToBlog}
          </button>
        </div>
      </section>
    </div>
  );
}

export default BlogModal;
