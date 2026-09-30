// components/FundingHeatmap.tsx
import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Search, 
  MapPin, 
  Filter, 
  Layers, 
  ExternalLink, 
  Radio, 
  X, 
  Info,
  ChevronRight,
  TrendingUp,
  Building2,
  Compass,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import { MOCK_FUNDING } from '../constants';
import { FundingType, FundingOpportunityDb } from '../types';
import { 
  SOUTH_AFRICA_VIEWBOX, 
  SOUTH_AFRICA_OUTLINE_PATH, 
  LESOTHO_CUTOUT_PATH, 
  SOUTH_AFRICA_FULL_SILHOUETTE, 
  SOUTH_AFRICA_PROVINCES, 
  SOUTH_AFRICA_CITIES,
  isPointInSouthAfrica,
  ProvinceGeoData,
  CityGeoData
} from '../utils/southAfricaMapData';

interface FundingHeatmapProps {
  onSelectOpportunity?: (opportunityId: string) => void;
}

export interface PlacedOpportunityDot {
  id: string;
  opportunity: FundingOpportunityDb;
  province: string;
  cityName: string;
  x: number;
  y: number;
  fundingType: FundingType | string;
  color: string;
  glowColor: string;
  pulseDelay: number;
}

const SECTOR_OPTIONS = [
  'All Sectors',
  'Technology',
  'Agriculture',
  'Manufacturing',
  'Energy',
  'Services',
  'Bio-tech',
  'Tourism'
];

export const FundingHeatmap: React.FC<FundingHeatmapProps> = ({ onSelectOpportunity }) => {
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [hoveredProvinceId, setHoveredProvinceId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('All Sectors');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [hoveredDot, setHoveredDot] = useState<PlacedOpportunityDot | null>(null);
  const [selectedDot, setSelectedDot] = useState<PlacedOpportunityDot | null>(null);
  
  const [showProvinces, setShowProvinces] = useState<boolean>(true);
  const [showCities, setShowCities] = useState<boolean>(true);
  const [showRadarSweep, setShowRadarSweep] = useState<boolean>(true);

  // Group cities by province for fast coordinate assignment
  const citiesByProvince = useMemo(() => {
    const map: Record<string, CityGeoData[]> = {};
    SOUTH_AFRICA_CITIES.forEach(c => {
      if (!map[c.province]) {
        map[c.province] = [];
      }
      map[c.province].push(c);
    });
    return map;
  }, []);

  const provinceNamesList = useMemo(() => {
    return SOUTH_AFRICA_PROVINCES.map(p => p.name);
  }, []);

  // Compute glowing dots strictly inside South Africa's landmass
  const allPlacedDots = useMemo(() => {
    const dots: PlacedOpportunityDot[] = [];

    // Weights for distributing national opportunities across SA's 9 provinces
    const provinceWeights: { name: string; weight: number }[] = [
      { name: 'Gauteng', weight: 30 },
      { name: 'Western Cape', weight: 22 },
      { name: 'KwaZulu-Natal', weight: 18 },
      { name: 'Eastern Cape', weight: 10 },
      { name: 'Free State', weight: 6 },
      { name: 'Mpumalanga', weight: 5 },
      { name: 'Limpopo', weight: 4 },
      { name: 'North West', weight: 3 },
      { name: 'Northern Cape', weight: 2 }
    ];

    let nationalCounter = 0;

    MOCK_FUNDING.forEach((opp, oppIndex) => {
      // 1. Determine target province
      let targetProvince = '';
      const geo = opp.geo_scope || 'National';

      for (const provName of provinceNamesList) {
        if (geo.toLowerCase().includes(provName.toLowerCase())) {
          targetProvince = provName;
          break;
        }
      }

      if (!targetProvince) {
        // Distribute national opportunities proportionally
        let acc = 0;
        const totalW = provinceWeights.reduce((s, w) => s + w.weight, 0);
        const pick = (nationalCounter % totalW);
        nationalCounter += 7; // advance sequence

        for (const pw of provinceWeights) {
          acc += pw.weight;
          if (pick < acc) {
            targetProvince = pw.name;
            break;
          }
        }
      }

      if (!targetProvince || !citiesByProvince[targetProvince]) {
        targetProvince = 'Gauteng';
      }

      const availableCities = citiesByProvince[targetProvince] || citiesByProvince['Gauteng'];
      const cityIndex = oppIndex % availableCities.length;
      const city = availableCities[cityIndex];

      // 2. Deterministic pseudo-random offset within radius, safely bounded
      const hash = ((oppIndex * 2654435761) ^ (city.x * 31 + city.y)) >>> 0;
      const angle = ((hash % 360) * Math.PI) / 180;
      let dist = 5 + (hash % 16);

      let x = city.x + Math.cos(angle) * dist;
      let y = city.y + Math.sin(angle) * dist;

      // 3. Guarantee 100% inside South Africa and outside Lesotho
      let step = 0;
      while (!isPointInSouthAfrica(x, y) && step < 6) {
        dist *= 0.5;
        x = city.x + Math.cos(angle) * dist;
        y = city.y + Math.sin(angle) * dist;
        step++;
      }

      if (!isPointInSouthAfrica(x, y)) {
        x = city.x;
        y = city.y;
      }

      // 4. Dot Color & Glow by Funding Type
      let color = '#10b981'; // Grant = Emerald
      let glowColor = 'rgba(16, 185, 129, 0.6)';

      if (opp.funding_type === FundingType.LOAN || opp.funding_type === 'LOAN') {
        color = '#f59e0b'; // Loan = Amber
        glowColor = 'rgba(245, 158, 11, 0.6)';
      } else if (
        opp.funding_type === FundingType.EQUITY || 
        opp.funding_type === 'EQUITY' || 
        opp.funding_type === FundingType.HYBRID ||
        opp.funding_type === 'HYBRID'
      ) {
        color = '#c084fc'; // Equity = Purple
        glowColor = 'rgba(192, 132, 252, 0.65)';
      } else if (opp.funding_type === FundingType.COMPETITION) {
        color = '#38bdf8'; // Competition = Sky blue
        glowColor = 'rgba(56, 189, 248, 0.6)';
      }

      dots.push({
        id: opp.opportunity_id || `opp-${oppIndex}`,
        opportunity: opp,
        province: targetProvince,
        cityName: city.name,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        fundingType: opp.funding_type,
        color,
        glowColor,
        pulseDelay: (oppIndex % 5) * 0.4
      });
    });

    return dots;
  }, [citiesByProvince, provinceNamesList]);

  // Province counts & stats
  const provinceStats = useMemo(() => {
    const stats: Record<string, { count: number; totalMax: number }> = {};
    SOUTH_AFRICA_PROVINCES.forEach(p => {
      stats[p.name] = { count: 0, totalMax: 0 };
    });

    allPlacedDots.forEach(d => {
      if (stats[d.province]) {
        stats[d.province].count += 1;
        stats[d.province].totalMax += d.opportunity.amount_max || 0;
      }
    });

    return stats;
  }, [allPlacedDots]);

  // Filtered dots based on active UI selections
  const filteredDots = useMemo(() => {
    return allPlacedDots.filter(dot => {
      // Province filter
      if (selectedProvinceId) {
        const prov = SOUTH_AFRICA_PROVINCES.find(p => p.id === selectedProvinceId);
        if (prov && dot.province !== prov.name) return false;
      }

      // Funding type filter
      if (selectedType !== 'ALL') {
        const fType = String(dot.fundingType).toUpperCase();
        if (selectedType === 'GRANT' && fType !== 'GRANT') return false;
        if (selectedType === 'LOAN' && fType !== 'LOAN') return false;
        if (selectedType === 'EQUITY' && fType !== 'EQUITY' && fType !== 'HYBRID') return false;
      }

      // Sector filter
      if (selectedSector !== 'All Sectors') {
        const matchesSector = dot.opportunity.sector_tags.some(t => 
          t.toLowerCase().includes(selectedSector.toLowerCase()) || 
          t === 'Any' || 
          t === 'Various'
        );
        if (!matchesSector) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = dot.opportunity.programme_name.toLowerCase().includes(q);
        const issuerMatch = dot.opportunity.issuer_name.toLowerCase().includes(q);
        const provMatch = dot.province.toLowerCase().includes(q);
        const cityMatch = dot.cityName.toLowerCase().includes(q);
        if (!titleMatch && !issuerMatch && !provMatch && !cityMatch) return false;
      }

      return true;
    });
  }, [allPlacedDots, selectedProvinceId, selectedType, selectedSector, searchQuery]);

  const activeProvince = useMemo(() => {
    const targetId = hoveredProvinceId || selectedProvinceId;
    if (!targetId) return null;
    return SOUTH_AFRICA_PROVINCES.find(p => p.id === targetId) || null;
  }, [hoveredProvinceId, selectedProvinceId]);

  const formatZAR = (amount: number) => {
    if (amount >= 1_000_000_000) {
      return `R${(amount / 1_000_000_000).toFixed(1)}B`;
    }
    if (amount >= 1_000_000) {
      return `R${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (amount >= 1_000) {
      return `R${(amount / 1_000).toFixed(0)}k`;
    }
    return `R${amount.toLocaleString()}`;
  };

  const totalCapitalPool = useMemo(() => {
    const total = filteredDots.reduce((acc, d) => acc + (d.opportunity.amount_max || 0), 0);
    return formatZAR(total);
  }, [filteredDots]);

  return (
    <div className="glass-panel p-4 sm:p-6 lg:p-7 rounded-3xl relative overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-[#090d16]/95 w-full min-w-0">
      {/* Ambient background glow accents */}
      <div className="absolute -top-24 -left-24 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.03)_0%,transparent_70%)] pointer-events-none" />

      {/* Top Header & Mission Control HUD */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 z-10 border-b border-white/5 pb-5 w-full min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live South Africa Capital Grid
            </span>
            <span className="text-xs text-gray-500">·</span>
            <span className="text-xs font-mono text-gray-400">RSA RADAR HUD</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2 truncate">
            Funding Landscape
          </h3>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
            Active grants, loans, and venture capital mapped within South Africa's physical landmass.
          </p>
        </div>

        {/* Live Metrics Cockpit */}
        <div className="flex items-center gap-2 sm:gap-3 self-start lg:self-auto flex-wrap min-w-0">
          <div className="bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 sm:px-3.5 sm:py-2 flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm shrink-0">
              <Radio size={16} />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-gray-400">Active Capital</p>
              <p className="text-xs sm:text-sm font-black text-white font-mono tabular-nums">{filteredDots.length} Funds</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 sm:px-3.5 sm:py-2 flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
              <DollarSign size={16} />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-gray-400">Available Pool</p>
              <p className="text-xs sm:text-sm font-black text-emerald-400 font-mono tabular-nums">{totalCapitalPool}</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 sm:px-3.5 sm:py-2 hidden xl:flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm shrink-0">
              <Compass size={16} />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-gray-400">Coverage</p>
              <p className="text-xs sm:text-sm font-black text-cyan-300 font-mono">9/9 Provinces</p>
            </div>
          </div>
        </div>
      </div>

      {/* Control Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4 z-10 w-full min-w-0">
        {/* Search */}
        <div className="md:col-span-4 min-w-0 relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search funder, grant, or city..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Funding Type Filter Tabs */}
        <div className="md:col-span-5 min-w-0 flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-xl overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              selectedType === 'ALL'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => setSelectedType('GRANT')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              selectedType === 'GRANT'
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            Grants
          </button>
          <button
            onClick={() => setSelectedType('LOAN')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              selectedType === 'LOAN'
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
            Loans
          </button>
          <button
            onClick={() => setSelectedType('EQUITY')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              selectedType === 'EQUITY'
                ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_6px_#c084fc]" />
            Equity
          </button>
        </div>

        {/* Sector Dropdown */}
        <div className="md:col-span-3 min-w-0">
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="w-full bg-[#111622] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-colors"
          >
            {SECTOR_OPTIONS.map(s => (
              <option key={s} value={s} className="bg-[#0b0f19] text-white">
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Province Selector Bar */}
      <div className="flex items-center gap-1.5 mb-4 z-10 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10 w-full min-w-0 max-w-full">
        <button
          onClick={() => setSelectedProvinceId(null)}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap uppercase tracking-wider shrink-0 ${
            selectedProvinceId === null
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
          }`}
        >
          All 9 Provinces
        </button>
        {SOUTH_AFRICA_PROVINCES.map(prov => {
          const isSelected = selectedProvinceId === prov.id;
          const stat = provinceStats[prov.name];
          return (
            <button
              key={prov.id}
              onClick={() => setSelectedProvinceId(isSelected ? null : prov.id)}
              onMouseEnter={() => setHoveredProvinceId(prov.id)}
              onMouseLeave={() => setHoveredProvinceId(null)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                isSelected
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-white/5'
              }`}
            >
              <span>{prov.name}</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/40 text-gray-400">
                {stat?.count || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Map Container */}
      <div className="relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-[500px] flex items-center justify-center rounded-2xl bg-[#070b12] border border-white/5 overflow-hidden p-2 sm:p-4 min-w-0 max-w-full">
        {/* Radar & Tactical Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.06)_0%,transparent_65%)]" />
          <div className="w-full h-full bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
          
          {/* Radar Circles */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-cyan-500/10 pointer-events-none" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full border border-cyan-500/5 pointer-events-none" />
          
          {/* Crosshairs & Geographic Coordinates */}
          <div className="absolute top-4 left-4 text-[9px] font-mono text-gray-500/70 tracking-widest">
            LAT -22°S → -35°S · LON 16°E → 33°E
          </div>
          <div className="absolute bottom-4 left-4 text-[9px] font-mono text-gray-500/70 tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
            SOUTH ATLANTIC BASIN
          </div>
          <div className="absolute bottom-4 right-4 text-[9px] font-mono text-gray-500/70 tracking-widest flex items-center gap-1.5">
            AGULHAS CURRENT · INDIAN OCEAN
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400/80" />
          </div>
        </div>

        {/* SVG Visualization: Cut Out Silhouette of South Africa */}
        <svg
          viewBox={SOUTH_AFRICA_VIEWBOX}
          className="w-full h-auto max-h-[540px] select-none"
          style={{ filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.7))' }}
        >
          <defs>
            {/* Glow Filter for Coastline Silhouette */}
            <filter id="sa-border-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Glowing Dot Filter */}
            <filter id="dot-intense-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Subtle Topographic Hatch Pattern for Landmass */}
            <pattern id="landmass-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.8" />
              <circle cx="12" cy="12" r="0.7" fill="rgba(56, 189, 248, 0.15)" />
            </pattern>

            {/* Landmass Linear Gradient */}
            <linearGradient id="sa-land-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#101826" />
              <stop offset="50%" stopColor="#0c121d" />
              <stop offset="100%" stopColor="#080e18" />
            </linearGradient>

            {/* Neon Perimeter Glow Gradient */}
            <linearGradient id="sa-border-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="40%" stopColor="#a855f7" stopOpacity="0.7" />
              <stop offset="80%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* 1. Base South Africa Physical Silhouette Cutout (evenodd handles Lesotho enclave) */}
          <g id="south-africa-landmass">
            {/* Outer halo blur */}
            <path
              d={SOUTH_AFRICA_FULL_SILHOUETTE}
              fillRule="evenodd"
              fill="none"
              stroke="rgba(56, 189, 248, 0.25)"
              strokeWidth="5"
              filter="url(#sa-border-glow)"
              className="opacity-70"
            />

            {/* Main Landmass Fill */}
            <path
              d={SOUTH_AFRICA_FULL_SILHOUETTE}
              fillRule="evenodd"
              fill="url(#sa-land-gradient)"
              stroke="url(#sa-border-gradient)"
              strokeWidth="1.8"
              className="transition-colors duration-500"
            />

            {/* Textured interior pattern clipped strictly to landmass */}
            <path
              d={SOUTH_AFRICA_FULL_SILHOUETTE}
              fillRule="evenodd"
              fill="url(#landmass-grid)"
              className="opacity-60 pointer-events-none"
            />
          </g>

          {/* 2. Lesotho Enclave Representation (Interior cutout) */}
          <g id="lesotho-enclave" className="pointer-events-none">
            <path
              d={LESOTHO_CUTOUT_PATH}
              fill="#06090f"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <text
              x="530"
              y="385"
              textAnchor="middle"
              className="fill-gray-500/70 text-[8px] font-mono tracking-widest font-semibold"
            >
              LESOTHO
            </text>
          </g>

          {/* 3. 9 Internal Provinces (Delicate boundaries & interactive zones) */}
          {showProvinces && (
            <g id="provinces-layer">
              {SOUTH_AFRICA_PROVINCES.map((prov) => {
                const isSelected = selectedProvinceId === prov.id;
                const isHovered = hoveredProvinceId === prov.id;
                const stat = provinceStats[prov.name];

                return (
                  <g 
                    key={prov.id}
                    className="cursor-pointer transition-all duration-200"
                    onClick={() => setSelectedProvinceId(isSelected ? null : prov.id)}
                    onMouseEnter={() => setHoveredProvinceId(prov.id)}
                    onMouseLeave={() => setHoveredProvinceId(null)}
                  >
                    {/* Province Polygon Fill on Hover/Select */}
                    <path
                      d={prov.path}
                      fill={
                        isSelected 
                          ? `${prov.color}35` 
                          : isHovered 
                          ? `${prov.color}20` 
                          : 'transparent'
                      }
                      stroke={
                        isSelected 
                          ? prov.color 
                          : isHovered 
                          ? 'rgba(255, 255, 255, 0.35)' 
                          : 'rgba(255, 255, 255, 0.08)'
                      }
                      strokeWidth={isSelected ? 1.8 : isHovered ? 1.2 : 0.8}
                      strokeDasharray={isSelected ? 'none' : '3,4'}
                      className="transition-all duration-300"
                    />

                    {/* Province Label (Subtle, professional) */}
                    <text
                      x={prov.labelX}
                      y={prov.labelY}
                      textAnchor="middle"
                      className={`text-[9px] font-mono font-bold tracking-wider pointer-events-none transition-all duration-300 ${
                        isSelected 
                          ? 'fill-white text-[10px]' 
                          : isHovered 
                          ? 'fill-cyan-300' 
                          : 'fill-gray-400/70'
                      }`}
                    >
                      {prov.code}
                    </text>
                    <text
                      x={prov.labelX}
                      y={prov.labelY + 10}
                      textAnchor="middle"
                      className={`text-[7px] font-mono pointer-events-none transition-all duration-300 ${
                        isSelected || isHovered ? 'fill-gray-300' : 'fill-gray-500/60'
                      }`}
                    >
                      {stat?.count || 0} funds
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 4. Major City Hubs (Anchor diamonds) */}
          {showCities && (
            <g id="cities-layer" className="pointer-events-none">
              {SOUTH_AFRICA_CITIES.slice(0, 16).map((city) => (
                <g key={city.name} transform={`translate(${city.x}, ${city.y})`} className="opacity-60">
                  <rect
                    x="-2"
                    y="-2"
                    width="4"
                    height="4"
                    transform="rotate(45)"
                    className="fill-cyan-400/80"
                  />
                  <text
                    x="5"
                    y="2"
                    className="fill-gray-400 text-[6.5px] font-mono font-medium tracking-tight"
                  >
                    {city.name}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* 5. Glowing Opportunity Dots (Strictly situated inside South Africa) */}
          <g id="glowing-dots-layer">
            {filteredDots.map((dot) => {
              const isHovered = hoveredDot?.id === dot.id;
              const isSelected = selectedDot?.id === dot.id;

              return (
                <g
                  key={dot.id}
                  transform={`translate(${dot.x}, ${dot.y})`}
                  className="cursor-pointer group"
                  onClick={() => setSelectedDot(dot)}
                  onMouseEnter={() => setHoveredDot(dot)}
                  onMouseLeave={() => setHoveredDot(null)}
                >
                  {/* Outer Pulsing Halo */}
                  <circle
                    r={isSelected ? 14 : isHovered ? 12 : 7}
                    fill={dot.glowColor}
                    className={`transition-all duration-300 ${
                      isSelected || isHovered ? 'opacity-90 animate-ping' : 'opacity-40'
                    }`}
                    style={{
                      animationDuration: isSelected ? '1.2s' : '2.5s',
                      animationDelay: `${dot.pulseDelay}s`
                    }}
                  />

                  {/* Mid Ring */}
                  <circle
                    r={isSelected ? 7 : isHovered ? 6 : 4}
                    fill={dot.color}
                    opacity="0.8"
                    filter="url(#dot-intense-glow)"
                    className="transition-all duration-200"
                  />

                  {/* Core Bright Center */}
                  <circle
                    r={isSelected ? 3.5 : isHovered ? 3 : 2}
                    fill="#ffffff"
                    className="transition-all duration-200"
                  />
                </g>
              );
            })}
          </g>

          {/* Hover Tooltip Rendered directly in SVG coordinate space for pin-point accuracy */}
          {hoveredDot && (
            <g
              transform={`translate(${
                hoveredDot.x > 500 ? hoveredDot.x - 220 : hoveredDot.x + 12
              }, ${
                hoveredDot.y > 500 ? hoveredDot.y - 95 : hoveredDot.y - 20
              })`}
              className="pointer-events-none z-50"
            >
              {/* Tooltip Card Background */}
              <rect
                width="210"
                height="85"
                rx="10"
                fill="#0b101c"
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="1"
                filter="url(#sa-border-glow)"
              />
              {/* Header: Title */}
              <text
                x="12"
                y="18"
                className="fill-white font-bold text-[10px]"
                lengthAdjust="spacingAndGlyphs"
              >
                {hoveredDot.opportunity.programme_name.length > 25
                  ? hoveredDot.opportunity.programme_name.slice(0, 25) + '...'
                  : hoveredDot.opportunity.programme_name}
              </text>
              {/* Issuer */}
              <text x="12" y="32" className="fill-gray-400 text-[8px] font-medium">
                {hoveredDot.opportunity.issuer_name.length > 32
                  ? hoveredDot.opportunity.issuer_name.slice(0, 32) + '...'
                  : hoveredDot.opportunity.issuer_name}
              </text>
              {/* Location Badge */}
              <text x="12" y="47" className="fill-cyan-300 text-[8px] font-mono font-semibold">
                📍 {hoveredDot.province} · {hoveredDot.cityName}
              </text>
              {/* Funding Type & Max Value */}
              <rect
                x="12"
                y="55"
                width="65"
                height="18"
                rx="4"
                fill={hoveredDot.glowColor}
              />
              <text
                x="44"
                y="67"
                textAnchor="middle"
                className="fill-white font-black text-[8px] uppercase tracking-wider"
              >
                {hoveredDot.fundingType}
              </text>
              <text
                x="88"
                y="67"
                className="fill-emerald-400 font-bold text-[9px] font-mono"
              >
                {hoveredDot.opportunity.amount_max 
                  ? `Up to ${formatZAR(hoveredDot.opportunity.amount_max)}` 
                  : 'Flexible'}
              </text>
            </g>
          )}
        </svg>

        {/* Active Province Floating HUD Badge */}
        {activeProvince && (
          <div className="absolute top-4 right-4 z-20 bg-[#0d1424]/90 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-xl max-w-[210px] animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
                Province Focus
              </span>
              <span 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: activeProvince.color }} 
              />
            </div>
            <h4 className="text-sm font-black text-white">{activeProvince.name}</h4>
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-xs font-mono">
              <span className="text-gray-400">Active Funds:</span>
              <span className="text-cyan-300 font-bold">
                {provinceStats[activeProvince.name]?.count || 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono mt-0.5">
              <span className="text-gray-400">Capital Pool:</span>
              <span className="text-emerald-400 font-bold">
                {formatZAR(provinceStats[activeProvince.name]?.totalMax || 0)}
              </span>
            </div>
          </div>
        )}

        {/* Selected Opportunity Floating Modal Drawer */}
        {selectedDot && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-30 bg-[#0f172a]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shadow-md"
                  style={{ backgroundColor: `${selectedDot.color}25`, color: selectedDot.color }}
                >
                  <DollarSign size={16} />
                </div>
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                    {selectedDot.province} · {selectedDot.cityName}
                  </span>
                  <h4 className="text-sm font-black text-white leading-tight">
                    {selectedDot.opportunity.programme_name}
                  </h4>
                </div>
              </div>
              <button
                onClick={() => setSelectedDot(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-gray-300 font-medium mb-3">
              {selectedDot.opportunity.issuer_name} ({selectedDot.opportunity.issuer_type})
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3 text-xs bg-white/5 p-2.5 rounded-xl border border-white/5">
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-mono block">Funding Type</span>
                <span className="font-bold text-white uppercase">{selectedDot.fundingType}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-mono block">Max Allocation</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {selectedDot.opportunity.amount_max 
                    ? formatZAR(selectedDot.opportunity.amount_max) 
                    : 'Discretionary'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-hidden">
                {selectedDot.opportunity.sector_tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-md text-gray-300 truncate"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {onSelectOpportunity ? (
                <button
                  onClick={() => onSelectOpportunity(selectedDot.opportunity.opportunity_id)}
                  className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1 shrink-0"
                >
                  Explore <ChevronRight size={13} />
                </button>
              ) : (
                <a
                  href={selectedDot.opportunity.application_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0"
                >
                  Portal <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Mission Control Footer: Legend & Map View Toggles */}
      <div className="mt-4 pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs z-10 w-full min-w-0">
        {/* Color Legend */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-gray-400 min-w-0">
          <span className="text-[10px] uppercase font-mono tracking-wider text-gray-500 font-bold shrink-0">Legend:</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span className="text-gray-300 font-medium">Grants (Non-repayable)</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
            <span className="text-gray-300 font-medium">Debt & Loans</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_#c084fc]" />
            <span className="text-gray-300 font-medium">Equity & Hybrid</span>
          </div>
        </div>

        {/* Layer Toggles */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
          <button
            onClick={() => setShowProvinces(!showProvinces)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
              showProvinces
                ? 'bg-white/10 text-white'
                : 'bg-white/5 text-gray-500 hover:text-gray-300'
            }`}
          >
            Provinces: {showProvinces ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setShowCities(!showCities)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
              showCities
                ? 'bg-white/10 text-white'
                : 'bg-white/5 text-gray-500 hover:text-gray-300'
            }`}
          >
            Hubs: {showCities ? 'ON' : 'OFF'}
          </button>
          {(selectedProvinceId || selectedType !== 'ALL' || selectedSector !== 'All Sectors' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedProvinceId(null);
                setSelectedType('ALL');
                setSelectedSector('All Sectors');
                setSearchQuery('');
              }}
              className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-2 ml-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FundingHeatmap;
