import React, { useMemo } from 'react';
import type { WorkloadExecution, DBTuningLog } from '../types';

interface Props {
    executions: WorkloadExecution[];
    tuningLogs: DBTuningLog[];
    height?: number;
}

const formatKST = (d: Date | string) => {
    return new Date(d).toLocaleString('ko-KR', { 
        timeZone: 'Asia/Seoul',
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

const PerformanceChart: React.FC<Props> = ({ executions, tuningLogs, height = 300 }) => {
    const sortedData = useMemo(() => {
        return [...executions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }, [executions]);

    const sortedLogs = useMemo(() => {
        return [...tuningLogs].sort((a, b) => new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime());
    }, [tuningLogs]);

    if (sortedData.length === 0) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#fafafa', borderRadius: 6, border: '1px dashed #eaeaea', fontSize: '13px' }}>
                데이터가 없습니다.
            </div>
        );
    }

    const timestamps = sortedData.map(d => new Date(d.created_at).getTime());
    const logTimestamps = sortedLogs.map(l => new Date(l.applied_at).getTime());
    
    const minTime = Math.min(...timestamps, ...(logTimestamps.length ? logTimestamps : [Infinity]));
    const maxTime = Math.max(...timestamps, ...(logTimestamps.length ? logTimestamps : [-Infinity]));
    
    const timePadding = (maxTime - minTime) * 0.05 || 1000 * 60 * 60; 
    const xMin = minTime - timePadding;
    const xMax = maxTime + timePadding;
    const timeRange = xMax - xMin;

    const execTimes = sortedData.map(d => d.execution_time_ms);
    const maxExecTime = Math.max(...execTimes, 0) * 1.1; 
    const yRange = maxExecTime || 100;

    const padding = { top: 30, bottom: 40, left: 50, right: 30 };
    const svgW = 1000;
    const svgH = height;
    const graphW = svgW - padding.left - padding.right;
    const graphH = svgH - padding.top - padding.bottom;

    const getX = (t: number) => padding.left + ((t - xMin) / timeRange) * graphW;
    const getY = (v: number) => padding.top + graphH - (v / yRange) * graphH;

    const linePath = sortedData.map((d, i) => {
        const x = getX(new Date(d.created_at).getTime());
        const y = getY(d.execution_time_ms);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(" ");

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => {
        const val = yRange * r;
        return { y: getY(val), val };
    });

    const xTickCount = 5;
    const xTicks = Array.from({ length: xTickCount }).map((_, i) => {
        const val = xMin + (timeRange * (i / (xTickCount - 1)));
        return { x: getX(val), label: formatKST(new Date(val)) };
    });

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" style={{ width: '100%', height: height, overflow: 'visible' }}>
                {yTicks.map((tick, i) => (
                    <g key={`y-${i}`}>
                        <line x1={padding.left} y1={tick.y} x2={svgW - padding.right} y2={tick.y} stroke="#eaeaea" strokeDasharray="3" />
                        <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#888" fontFamily="var(--font-mono)">
                            {tick.val.toFixed(0)} ms
                        </text>
                    </g>
                ))}

                {xTicks.map((tick, i) => (
                    <g key={`x-${i}`}>
                        <text x={tick.x} y={svgH - 5} textAnchor="middle" fontSize="10" fill="#888">
                            {tick.label}
                        </text>
                    </g>
                ))}

                {sortedLogs.map((log, i) => {
                    const x = getX(new Date(log.applied_at).getTime());
                    if (x < padding.left || x > svgW - padding.right) return null;
                    return (
                        <g key={`log-${i}`} className="tuning-marker">
                            <line x1={x} y1={padding.top} x2={x} y2={svgH - padding.bottom} stroke="#ef4444" strokeWidth="1" strokeDasharray="4" />
                            <circle cx={x} cy={padding.top} r={4} fill="#ef4444" />
                            <text x={x} y={padding.top - 10} textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="600">
                                {log.is_reverted ? 'Revert' : 'Tune'}
                            </text>
                        </g>
                    );
                })}

                <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                
                {sortedData.map((d, i) => {
                    const x = getX(new Date(d.created_at).getTime());
                    const y = getY(d.execution_time_ms);
                    return (
                        <circle key={`pt-${i}`} cx={x} cy={y} r={3} fill="#fff" stroke="#2563eb" strokeWidth="2">
                            <title>{`Time: ${d.execution_time_ms.toFixed(2)}ms\nDate: ${formatKST(d.created_at)}`}</title>
                        </circle>
                    );
                })}
            </svg>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 2, background: '#2563eb' }}></div>
                    <span>Execution Time (ms)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 0, borderTop: '2px dashed #ef4444' }}></div>
                    <span>Tuning Event</span>
                </div>
            </div>
        </div>
    );
};

export default PerformanceChart;