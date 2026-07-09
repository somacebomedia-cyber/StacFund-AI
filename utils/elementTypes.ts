/**
 * StacFund Structural DOM Taxonomy
 * ================================
 * Defines a standard taxonomy of over 50 semantic element types.
 * These are injected as `data-element-type` and `data-element-role` DOM attributes,
 * enabling programmatic layout crawlers and export tools to parse our documents
 * semantically (e.g. for PPTX, PDF, or HTML exports) rather than guessing from CSS styles.
 */

export const ELEMENT_TAXONOMY = {
  // Document Structure
  DOCUMENT_ROOT: 'document-root',
  PAGE_WRAPPER: 'page-wrapper',
  SECTION_ROOT: 'section-root',
  CONTAINER_COVER: 'container-cover',
  CONTAINER_SLIDE: 'container-slide',
  CONTAINER_GRID: 'container-grid',
  CONTAINER_ROW: 'container-row',
  CONTAINER_COLUMN: 'container-column',
  
  // Header / Footer Meta
  HEADER_SECTION: 'header-section',
  FOOTER_SECTION: 'footer-section',
  LOGO_HEADER: 'logo-header',
  SLIDE_NUMBER: 'slide-number',
  METADATA_LINE: 'metadata-line',
  
  // Typography & Headings
  HEADING_PRIMARY: 'heading-primary',
  HEADING_SECONDARY: 'heading-secondary',
  HEADING_TERTIARY: 'heading-tertiary',
  HEADING_SECTION: 'heading-section',
  TITLE_COVER: 'title-cover',
  SUBTITLE_COVER: 'subtitle-cover',
  TEXT_BODY: 'text-body',
  TEXT_CAPTION: 'text-caption',
  TEXT_LEAD: 'text-lead',
  
  // Lists & Items
  LIST_BULLET: 'list-bullet',
  LIST_NUMBERED: 'list-numbered',
  TEXT_BULLET: 'text-bullet',
  TEXT_BULLET_ITEM: 'text-bullet-item',
  CHECKLIST_ROOT: 'checklist-root',
  CHECKLIST_ITEM: 'checklist-item',
  
  // Interactive Elements & Cards
  CARD: 'card',
  CARD_HEADER: 'card-header',
  CARD_BODY: 'card-body',
  CARD_FOOTER: 'card-footer',
  BENTO_GRID: 'bento-grid',
  BENTO_ITEM: 'bento-item',
  PILL: 'pill',
  BADGE: 'badge',
  ICON_WRAPPER: 'icon-wrapper',
  
  // Visual Media
  IMAGE_SLIDE: 'image-slide',
  IMAGE_BACKGROUND: 'image-background',
  IMAGE_AVATAR: 'image-avatar',
  CHART_CONTAINER: 'chart-container',
  CHART_ELEMENT: 'chart-element',
  CHART_PIE: 'chart-pie',
  CHART_BAR: 'chart-bar',
  CHART_LINE: 'chart-line',
  VECTOR_DECORATIVE: 'vector-decorative',
  VECTOR_BLOB: 'vector-blob',
  
  // Complex Editorial Components
  QUOTE_CONTAINER: 'quote-container',
  QUOTE_TEXT: 'quote-text',
  QUOTE_AUTHOR: 'quote-author',
  TESTIMONIAL: 'testimonial',
  
  // Compliance & SA Specifics
  SA_COMPLIANCE_WIDGET: 'sa-compliance-widget',
  COMPLIANCE_ITEM: 'compliance-item',
  COMPLIANCE_STATUS: 'compliance-status',
  BEE_SCORE_CARD: 'bee-score-card',
  TAX_CLEARANCE_STATUS: 'tax-clearance-status',
  CIPC_DETAILS: 'cipc-details',
  
  // Financial Specifics
  FINANCIAL_TABLE: 'financial-table',
  FINANCIAL_ROW: 'financial-row',
  FINANCIAL_CELL: 'financial-cell',
  FINANCIAL_TOTAL: 'financial-total',
  FINANCIAL_METRIC: 'financial-metric',
  ASK_AMOUNT: 'ask-amount',
  ASK_BREAKDOWN: 'ask-breakdown'
} as const;

export type ElementType = typeof ELEMENT_TAXONOMY[keyof typeof ELEMENT_TAXONOMY];

/**
 * Returns helper props to inject semantic markup into React components.
 * 
 * Example usage:
 * <div {...el(ELEMENT_TAXONOMY.CARD, 'pricing')}> ... </div>
 */
export function el(type: ElementType, role?: string) {
  return {
    'data-element-type': type,
    ...(role ? { 'data-element-role': role } : {})
  };
}
