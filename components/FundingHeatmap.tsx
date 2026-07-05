import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MOCK_FUNDING } from '../constants';

const REGIONS = [
  'National',
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Limpopo',
  'Mpumalanga',
  'Free State',
  'North West'
];

const SECTORS = [
  'Any',
  'Agriculture',
  'Manufacturing',
  'Technology',
  'Tourism',
  'Energy',
  'Infrastructure',
  'Services'
];

interface HeatmapDataPoint {
  x: number; // Sector index
  y: number; // Region index
  z: number; // Count
  sector: string;
  region: string;
}

export const FundingHeatmap: React.FC = () => {
  const data = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    
    // Initialize matrix
    REGIONS.forEach(region => {
      matrix[region] = {};
      SECTORS.forEach(sector => {
        matrix[region][sector] = 0;
      });
    });

    // Populate matrix
    MOCK_FUNDING.forEach(opp => {
      // Find matching region or default to National if not in our top list
      let region = opp.geo_scope;
      if (!REGIONS.includes(region)) {
        if (region.toLowerCase().includes('national')) {
            region = 'National';
        } else {
            return; // Skip if it doesn't match our specific regions for simplicity
        }
      }

      // Add to each matching sector
      opp.sector_tags.forEach(sectorTag => {
        // If the sector tag is in our list, increment it
        if (SECTORS.includes(sectorTag)) {
          if (matrix[region] && matrix[region][sectorTag] !== undefined) {
             matrix[region][sectorTag]++;
          }
        } else if (sectorTag === 'Various' || sectorTag === 'Any') {
             if (matrix[region]) {
                 matrix[region]['Any']++;
             }
        }
      });
    });

    const flattenedData: HeatmapDataPoint[] = [];
    REGIONS.forEach((region, yIndex) => {
      SECTORS.forEach((sector, xIndex) => {
        const count = matrix[region][sector];
        if (count > 0) {
          flattenedData.push({
            x: xIndex,
            y: yIndex,
            z: count,
            sector,
            region
          });
        }
      });
    });

    return flattenedData;
  }, []);

  const formatXAxis = (tickItem: number) => {
    return SECTORS[tickItem] || '';
  };

  const formatYAxis = (tickItem: number) => {
    return REGIONS[tickItem] || '';
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-panel p-3 rounded-xl border border-white/10 bg-[#0a0f16]/90 backdrop-blur-md">
          <p className="font-bold text-white mb-1">{data.region} • {data.sector}</p>
          <p className="text-purple-400 font-black text-lg">
            {data.z} <span className="text-xs text-gray-400 font-normal uppercase tracking-wider">Opportunities</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel p-6 rounded-3xl group relative overflow-hidden flex flex-col h-[500px]">
      <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] group-hover:bg-purple-500/20 transition-all pointer-events-none"></div>
      
      <div className="mb-6 z-10">
        <h3 className="text-xl font-black mb-1">Funding Landscape</h3>
        <p className="text-sm text-gray-400">Concentration of active grants & loans by region and sector.</p>
      </div>

      <div className="flex-1 w-full relative z-10 -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 80 }}>
            <XAxis 
              type="number" 
              dataKey="x" 
              name="Sector" 
              domain={[0, SECTORS.length - 1]} 
              tickFormatter={formatXAxis} 
              interval={0}
              tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              dx={-5}
              dy={10}
            />
            <YAxis 
              type="number" 
              dataKey="y" 
              name="Region" 
              domain={[0, REGIONS.length - 1]} 
              tickFormatter={formatYAxis} 
              interval={0}
              tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              reversed
            />
            <ZAxis 
              type="number" 
              dataKey="z" 
              range={[50, 600]} 
              name="Count" 
            />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} 
            />
            <Scatter data={data} animationDuration={1000}>
              {data.map((entry, index) => {
                // Determine color based on count (intensity)
                let color = '#a855f7'; // purple-500 (default/low)
                if (entry.z > 15) color = '#ec4899'; // pink-500 (high)
                else if (entry.z > 5) color = '#8b5cf6'; // violet-500 (medium)
                
                return (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={color} 
                    className="drop-shadow-[0_0_8px_rgba(168,85,247,0.5)] transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(236,72,153,0.8)]"
                    style={{
                       filter: `drop-shadow(0px 0px 8px ${color}80)`
                    }}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FundingHeatmap;
