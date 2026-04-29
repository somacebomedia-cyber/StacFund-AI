
import { FundingType, FundingOpportunity, Achievement } from './types';

export const MOCK_FUNDING: FundingOpportunity[] = [
  {
    id: '1',
    title: 'Small Business Growth Grant 2025',
    provider: 'Global Business Foundation',
    type: FundingType.GRANT,
    description: 'Non-repayable grant for small businesses looking to expand operations, hire staff, or invest in technology. Perfect for businesses with 1-20 employees.',
    range: 'R150K - R500K',
    deadline: 'June 30, 2026',
    tags: ['Technology', 'Retail'],
    isNew: true
  },
  {
    id: '2',
    title: 'Township Economy Support Fund',
    provider: 'Informal Business Development Agency',
    type: FundingType.GRANT,
    description: 'Specifically designed for informal, unregistered businesses and street vendors operating within township economies. No formal company registration required. Funds can be used for stock, basic equipment, or formalization.',
    range: 'R5K - R25K',
    deadline: 'Rolling',
    tags: ['Informal Sector', 'Township Economy', 'Retail'],
    isNew: true
  },
  {
    id: '3',
    title: 'Community Cooperative Development Loan',
    provider: 'Empowerment Bank',
    type: FundingType.LOAN,
    description: 'Low-interest loans specifically for registered community worker cooperatives and housing cooperatives. Flexible repayment terms up to 5 years with competitive interest rates starting at 4%.',
    range: 'R50K - R500K',
    deadline: 'March 31, 2026',
    tags: ['Cooperatives', 'Agriculture', 'Manufacturing'],
    isNew: true
  },
  {
    id: '4',
    title: 'Social Impact NPO Grant',
    provider: 'National Development Foundation',
    type: FundingType.GRANT,
    description: 'Grant funding for Non-Profit Organizations (NPOs) and NGOs driving community upliftment, education, or healthcare initiatives. Must be registered as an NPO.',
    range: 'R100K - R1.5M',
    deadline: 'May 15, 2026',
    tags: ['NPO', 'Social Impact', 'Education', 'Healthcare'],
    isNew: true
  },
  {
    id: '5',
    title: 'Micro-Enterprise Starter Kit',
    provider: 'Youth Enterprise Fund',
    type: FundingType.GRANT,
    description: 'Starter grants for very early-stage informal businesses run by youth (18-35). Provides funding for basic tooling, materials, or initial marketing. Unregistered businesses are welcome.',
    range: 'R2K - R15K',
    deadline: 'August 30, 2026',
    tags: ['Youth', 'Informal Sector', 'All Industries'],
    isNew: true
  },
  {
    id: '6',
    title: 'Agri-Coop Machinery Fund',
    provider: 'Agricultural Finance Board',
    type: FundingType.GRANT,
    description: 'A dedicated fund to help agricultural cooperatives acquire farming machinery, irrigation systems, or processing equipment.',
    range: 'R200K - R2M',
    deadline: 'September 1, 2026',
    tags: ['Cooperatives', 'Agriculture'],
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
