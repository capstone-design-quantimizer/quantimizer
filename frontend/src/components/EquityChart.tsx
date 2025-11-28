import React from 'react';
import type { EquityPoint } from '../types';

interface Props {
    data: EquityPoint[];
    comparison?: { label: string; data: EquityPoint[] };
    height?: number;
}

const formatDate = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
const formatNum = (n: number) => new Intl.NumberFormat('ko-KR', { notation: "compact", maximumFractionDigits: 1 }).format(n);

const EquityChart: React.FC<Props> = ({ data, comparison, height = 240 }) => {
    if (!data || data.length === 0) {
        return <div className="equity-chart" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#fafafa', borderRadius: 6, border: '1px dashed #eaeaea' }}>데이터 없음</div>;
    }

    const mainData = data.map(d => d.equity);
    const compData = comparison ? comparison.data.map(d => d.equity) : [];
    const allValues = [...mainData, ...compData];

    const minVal = Math.min(...allValues) * 0.98;
    const maxVal = Math.max(...allValues) * 1.02;
    const range = maxVal - minVal || 1;

    let peak = -Infinity;
    const mddSeries = data.map(d => {
        if (d.equity > peak) peak = d.equity;
        return (d.equity - peak) / peak;
    });
    const minMdd = Math.min(...mddSeries);
    const mddRange = Math.abs(minMdd) || 0.1;

    const padding = { top: 20, bottom: 30, left: 50, right: 20 };
    const svgW = 1000;
    const svgH = height;
    const graphW = svgW - padding.left - padding.right;
    const graphH = svgH - padding.top - padding.bottom;

    const getPoints = (series: number[]) => {
        if (series.length === 0) return "";
        return series.map((val, i) => {
            const x = padding.left + (i / (series.length - 1)) * graphW;
            const y = padding.top + graphH - ((val - minVal) / range) * graphH;
            return `${x},${y}`;
        }).join(" ");
    };

    const getMddPoints = () => {
        if (mddSeries.length === 0) return "";
        return mddSeries.map((val, i) => {
            const x = padding.left + (i / (mddSeries.length - 1)) * graphW;
            const y = padding.top + graphH - (Math.abs(val) / mddRange) * (graphH * 0.25);
            return `${x},${y}`;
        }).join(" ");
    };

    const yTicks = [0, 1, 2, 3].map(i => {
        const val = minVal + (range * (i / 3));
        const y = padding.top + graphH - ((val - minVal) / range) * graphH;
        return { y, val };
    });

    const xTicks = [
        { x: padding.left, label: formatDate(data[0].date) },
        { x: padding.left + graphW / 2, label: formatDate(data[Math.floor(data.length / 2)].date) },
        { x: padding.left + graphW, label: formatDate(data[data.length - 1].date) }
    ];

    return (
        <div>
            <div className="equity-chart" style={{ height }}>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="chart-svg">
                    {yTicks.map((tick, i) => (
                        <g key={i}>
                            <line x1={padding.left} y1={tick.y} x2={svgW - padding.right} y2={tick.y} className="chart-grid" />
                            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="chart-axis-text">{formatNum(tick.val)}</text>
                        </g>
                    ))}
                    {xTicks.map((tick, i) => (
                        <text key={i} x={tick.x} y={svgH - 5} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="chart-axis-text">{tick.label}</text>
                    ))}
                    {comparison && (
                        <polyline points={getPoints(compData)} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4,2" vectorEffect="non-scaling-stroke" opacity={0.5} />
                    )}
                    <polyline points={getPoints(mainData)} fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <polyline points={getMddPoints()} fill="none" stroke="#ef4444" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity={0.8} />
                </svg>
            </div>
            <div className="chart-legend-html">
                <div className="legend-item"><div className="legend-dot" style={{ background: "#2563eb" }}></div><span>Equity</span></div>
                <div className="legend-item"><div className="legend-dot" style={{ background: "#ef4444" }}></div><span>Drawdown</span></div>
                {comparison && <div className="legend-item"><div className="legend-dot" style={{ background: "#dc2626", opacity: 0.5 }}></div><span style={{ color: "#dc2626" }}>{comparison.label}</span></div>}
            </div>
        </div>
    );
};

export default EquityChart;