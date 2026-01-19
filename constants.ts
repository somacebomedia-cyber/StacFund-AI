
import { FundingType, FundingOpportunity, Achievement } from './types';

export const MOCK_FUNDING: FundingOpportunity[] = [
  {
    id: '1',
    title: 'Small Business Growth Grant 2025',
    provider: 'Global Business Foundation',
    type: FundingType.GRANT,
    description: 'Non-repayable grant for small businesses looking to expand operations, hire staff, or invest in technology. Perfect for businesses with 1-20 employees.',
    range: '$10K - $50K',
    deadline: 'June 30, 2025',
    tags: ['Technology', 'Retail'],
    isNew: true
  },
  {
    id: '2',
    title: 'Tech Innovation Accelerator Fund',
    provider: 'TechVentures Capital',
    type: FundingType.EQUITY,
    description: 'Equity investment for early-stage tech startups developing innovative solutions. We provide funding plus mentorship and market access.',
    range: '$50K - $250K',
    deadline: 'Rolling',
    tags: ['Technology', 'Software'],
    isNew: true
  },
  {
    id: '3',
    title: 'Women Entrepreneurs Loan Program',
    provider: 'Empowerment Bank',
    type: FundingType.LOAN,
    description: 'Low-interest loans specifically for women-owned businesses. Flexible repayment terms up to 5 years with competitive interest rates starting at 6%.',
    range: '$5K - $100K',
    deadline: 'March 31, 2025',
    tags: ['All Industries'],
    isNew: true
  },
  {
    id: '4',
    title: 'Green Business Innovation Grant',
    provider: 'Environmental Action Fund',
    type: FundingType.GRANT,
    description: 'Grant funding for businesses developing sustainable and environmentally-friendly solutions. Priority given to renewable energy projects.',
    range: '$25K - $150K',
    deadline: 'May 15, 2025',
    tags: ['Clean Energy', 'Sustainability'],
    isNew: true
  },
  {
    id: '5',
    title: 'Startup Pitch Competition 2025',
    provider: 'Global Startup League',
    type: FundingType.COMPETITION,
    description: 'Win up to $500K in funding through our international pitch competition. Top 10 finalists get mentorship and exposure to global investors.',
    range: 'Up to $500K',
    deadline: 'April 30, 2025',
    tags: ['Technology', 'Healthcare'],
    isNew: true
  }
];

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'a1',
    title: 'First Steps',
    description: 'Created your profile',
    completed: true,
    icon: 'star'
  },
  {
    id: 'a2',
    title: 'Document Master',
    description: 'Upload 5 documents',
    completed: false,
    icon: 'upload'
  },
  {
    id: 'a3',
    title: 'Application Pro',
    description: 'Start 10 applications',
    completed: false,
    icon: 'file-text'
  },
  {
    id: 'a4',
    title: 'Success Story',
    description: 'Get funding approved',
    completed: false,
    icon: 'trophy'
  }
];
