import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import type { 
    DBTuneResult, 
    DBTuningLog,
    Workload, 
    WorkloadExecution, 
    AdminDashboardStats,
    UserSummary
} from '../types/index';
import PerformanceChart from '../components/PerformanceChart'; 
import { Modal } from '../components/Shared';

interface Props {
    api: (url: string, opts?: any) => Promise<Response>;
    onLogout: () => void;
}

const formatKST = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

const AdminDashboard: React.FC<Props> = ({ api, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'tuning' | 'workload' | 'monitor'>('stats');

    const [stats, setStats] = useState<AdminDashboardStats | null>(null);
    const [users, setUsers] = useState<UserSummary[]>([]);

    const [tuneFile, setTuneFile] = useState<File | null>(null);
    const [tuneResult, setTuneResult] = useState<DBTuneResult | null>(null);
    const [tuningLogs, setTuningLogs] = useState<DBTuningLog[]>([]);
    const [tuningLoading, setTuningLoading] = useState(false);

    const [workloads, setWorkloads] = useState<Workload[]>([]);
    const [executions, setExecutions] = useState<WorkloadExecution[]>([]);
    const [wlForm, setWlForm] = useState({ name: '', description: '', count: 100 });
    const [wlLoading, setWlLoading] = useState(false);
    const [selectedWorkloadForQueries, setSelectedWorkloadForQueries] = useState<Workload | null>(null);

    const [selectedExecution, setSelectedExecution] = useState<WorkloadExecution | null>(null);
    const [monitorWorkloadId, setMonitorWorkloadId] = useState<string>('ALL');

    const loadStats = async () => {
        try {
            const res = await api('/admin/dashboard/stats');
            if (res.ok) setStats(await res.json());
        } catch (e) { console.error(e); }
    };

    const loadUsers = async () => {
        try {
            const res = await api('/admin/users');
            if (res.ok) setUsers(await res.json());
        } catch (e) { console.error(e); }
    };

    const loadTuningLogs = async () => {
        try {
            const res = await api('/admin/tune/logs');
            if (res.ok) setTuningLogs(await res.json());
        } catch (e) { console.error(e); }
    };

    const loadWorkloads = async () => {
        try {
            const res = await api('/admin/workloads');
            if (res.ok) setWorkloads(await res.json());
        } catch (e) { console.error(e); }
    };

    const loadExecutions = async () => {
        try {
            const res = await api('/admin/executions');
            if (res.ok) setExecutions(await res.json());
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (activeTab === 'stats') loadStats();
        if (activeTab === 'users') loadUsers();
        if (activeTab === 'tuning') loadTuningLogs();
        if (activeTab === 'workload') loadWorkloads();
        if (activeTab === 'monitor') {
            loadWorkloads();
            loadExecutions();
            loadTuningLogs();
        }
    }, [activeTab]);

    const handleTuneUpload = async () => {
        if (!tuneFile) return Swal.fire("알림", "파일을 선택해주세요.", "warning");
        setTuningLoading(true);
        const formData = new FormData();
        formData.append('file', tuneFile);
        try {
            const res = await api("/admin/tune", { method: "POST", body: formData });
            if (res.ok) {
                setTuneResult(await res.json());
                loadTuningLogs();
                setTuneFile(null); 
                Swal.fire("성공", "DB 설정이 적용되었습니다.", "success");
            } else {
                Swal.fire("실패", "적용 실패", "error");
            }
        } catch (e) {
            Swal.fire("오류", "업로드 중 오류 발생", "error");
        } finally {
            setTuningLoading(false);
        }
    };

    const handleRestore = async (logId: string) => {
        const r = await Swal.fire({
            title: '설정 복원',
            text: "이전 설정으로 되돌리시겠습니까?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '복원',
            cancelButtonText: '취소'
        });

        if (r.isConfirmed) {
            setTuningLoading(true);
            try {
                const res = await api(`/admin/tune/${logId}/restore`, { method: "POST" });
                if (res.ok) {
                    await res.json();
                    loadTuningLogs();
                    Swal.fire("완료", "설정이 복원되었습니다.", "success");
                } else {
                    Swal.fire("실패", "복원 중 오류 발생", "error");
                }
            } catch {
                Swal.fire("오류", "네트워크 오류", "error");
            } finally {
                setTuningLoading(false);
            }
        }
    };

    const handleCreateWorkload = async () => {
        if (!wlForm.name) return Swal.fire("알림", "워크로드 이름을 입력하세요.", "warning");
        setWlLoading(true);
        try {
            const res = await api("/admin/workloads", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(wlForm)
            });
            if (res.ok) {
                Swal.fire("완료", "워크로드가 생성되었습니다.", "success");
                setWlForm({ name: '', description: '', count: 100 });
                loadWorkloads();
            }
        } catch {
            Swal.fire("오류", "생성 실패", "error");
        } finally {
            setWlLoading(false);
        }
    };

    const handleExecuteWorkload = async (id: string) => {
        const result = await Swal.fire({
            title: '워크로드 실행',
            text: "실제 DB 쿼리가 실행됩니다. 진행하시겠습니까?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '실행',
            cancelButtonText: '취소'
        });
        
        if (!result.isConfirmed) return;

        setWlLoading(true);
        try {
            const res = await api(`/admin/workloads/${id}/execute`, { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                Swal.fire("실행 완료", `소요 시간: ${data.execution_time_ms.toFixed(2)}ms`, "success");
            } else {
                Swal.fire("실패", "실행 중 오류가 발생했습니다.", "error");
            }
        } catch {
            Swal.fire("오류", "네트워크 오류", "error");
        } finally {
            setWlLoading(false);
        }
    };

    const handleViewQueries = async (id: string) => {
        try {
            const res = await api(`/admin/workloads/${id}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedWorkloadForQueries(data);
            } else {
                Swal.fire("실패", "쿼리 정보를 불러오지 못했습니다.", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const enrichedExecutions = useMemo(() => {
        return executions.map(e => ({
            ...e,
            workload_name: workloads.find(w => w.id === e.workload_id)?.name || 'Unknown'
        }));
    }, [executions, workloads]);

    const filteredExecutions = useMemo(() => {
        if (monitorWorkloadId === 'ALL') return enrichedExecutions;
        return enrichedExecutions.filter(e => e.workload_id === monitorWorkloadId);
    }, [enrichedExecutions, monitorWorkloadId]);

    const StatCard = ({ label, value, unit, color }: { label: string, value: string | number, unit?: string, color?: string }) => (
        <div style={{ background: '#f9fafb', borderRadius: 12, padding: '20px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 13, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.025em', marginBottom: 8 }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: color || '#111827', fontFamily: 'var(--font-mono)' }}>{value}</span>
                {unit && <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500 }}>{unit}</span>}
            </div>
        </div>
    );

    return (
        <div className="app-shell">
            <header className="top-header" style={{background: '#1a1a1a', borderBottom: '1px solid #333'}}>
                <div className="top-header__inner">
                    <div className="header-top-row">
                        <div className="brand" style={{color: '#fff'}}>
                            <div className="brand-logo" style={{background: '#fff', color: '#000'}}>A</div> 
                            Admin Portal
                        </div>
                        <button className="logout-button" style={{color: '#aaa', borderColor: '#444'}} onClick={onLogout}>
                            로그아웃
                        </button>
                    </div>
                    <nav className="nav-tabs">
                        {[
                            { id: 'stats', label: '대시보드' },
                            { id: 'users', label: '사용자 관리' },
                            { id: 'tuning', label: 'DB 튜닝' },
                            { id: 'workload', label: '워크로드' },
                            { id: 'monitor', label: '성능 모니터링' }
                        ].map(tab => (
                            <button 
                                key={tab.id} 
                                className={`nav-tab ${activeTab === tab.id ? 'nav-tab--active' : ''}`}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    color: activeTab === tab.id ? '#fff' : '#888',
                                    borderBottomColor: activeTab === tab.id ? '#fff' : 'transparent'
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="main-content">
                {activeTab === 'stats' && stats && (
                    <>
                        <h2 className="section-title">서비스 현황</h2>
                        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <div className="kpi">
                                <div className="kpi__label">총 사용자</div>
                                <div className="kpi__value">{stats.total_users}</div>
                            </div>
                            <div className="kpi">
                                <div className="kpi__label">누적 백테스트</div>
                                <div className="kpi__value">{stats.total_backtests}</div>
                            </div>
                            <div className="kpi">
                                <div className="kpi__label">전략 수</div>
                                <div className="kpi__value">{stats.total_strategies}</div>
                            </div>
                            <div className="kpi">
                                <div className="kpi__label">오늘 게시글 / 전체</div>
                                <div className="kpi__value">{stats.community_posts_today} <span style={{fontSize: 16, color: '#888'}}>/ {stats.community_posts_total}</span></div>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'users' && (
                    <div className="card">
                        <div className="card__header">가입 사용자 목록</div>
                        <div className="table-wrapper">
                            <table className="table">
                                <thead><tr><th>이메일</th><th>사용자명</th><th>가입일</th><th>전략 수</th><th>백테스트 수</th></tr></thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td>{u.email}</td>
                                            <td style={{fontWeight: 600}}>{u.username}</td>
                                            <td>{formatKST(u.joined_at)}</td>
                                            <td>{u.strategy_count}</td>
                                            <td>{u.backtest_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'tuning' && (
                    <div className="builder-split-view">
                        <div className="card" style={{ flex: 1 }}>
                            <div className="card__header">Knob 튜닝 자동화</div>
                            <div className="card__body">
                                <p className="card-desc">AI 모델이 추천한 JSON 설정 파일을 업로드하여 PostgreSQL 설정을 변경합니다.</p>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
                                    <input type="file" accept=".json" onChange={e => { if (e.target.files?.[0]) setTuneFile(e.target.files[0]); }} className="input" style={{ paddingTop: 6, height: 40 }} />
                                    <button className="btn btn--primary" onClick={handleTuneUpload} disabled={tuningLoading || !tuneFile}>
                                        {tuningLoading ? '적용 중...' : '설정 적용하기'}
                                    </button>
                                </div>
                                {tuneResult && (
                                    <div style={{ padding: 20, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>최근 적용 결과</h4>
                                        <div className="form-stack">
                                            <div>적용된 파라미터: <b>{tuneResult.applied_count}개</b></div>
                                            {tuneResult.restart_required_params.length > 0 && (
                                                <div style={{ color: '#e00', fontSize: 13 }}>⚠️ 재시작 필요: {tuneResult.restart_required_params.join(", ")}</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card" style={{ flex: 1 }}>
                            <div className="card__header">튜닝 이력 및 복원</div>
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead><tr><th>적용 일시</th><th>파일명</th><th>상태</th><th>관리</th></tr></thead>
                                    <tbody>
                                        {tuningLogs.map(log => (
                                            <tr key={log.id}>
                                                <td>{formatKST(log.applied_at)}</td>
                                                <td>{log.filename || log.applied_by}</td>
                                                <td>
                                                    {log.is_reverted ? <span style={{color: '#999'}}>복원됨</span> : <span style={{color: 'green'}}>적용 중</span>}
                                                </td>
                                                <td>
                                                    {!log.is_reverted && (
                                                        <button 
                                                            className="btn btn--danger btn--sm" 
                                                            onClick={() => handleRestore(log.id)}
                                                            disabled={tuningLoading}
                                                        >
                                                            ↩ 복원
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'workload' && (
                    <div className="builder-split-view">
                        <div className="card" style={{ flex: 1 }}>
                            <div className="card__header">새 워크로드 생성</div>
                            <div className="card__body form-stack">
                                <input className="input" value={wlForm.name} onChange={e => setWlForm({...wlForm, name: e.target.value})} placeholder="워크로드 이름" />
                                <input className="input" value={wlForm.description} onChange={e => setWlForm({...wlForm, description: e.target.value})} placeholder="설명" />
                                <input className="input" type="number" value={wlForm.count} onChange={e => setWlForm({...wlForm, count: Number(e.target.value)})} placeholder="쿼리 수" />
                                <button className="btn btn--primary" onClick={handleCreateWorkload} disabled={wlLoading}>생성하기</button>
                            </div>
                        </div>
                        <div className="card" style={{ flex: 2 }}>
                            <div className="card__header">목록</div>
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead><tr><th>이름</th><th>쿼리 수</th><th>관리</th></tr></thead>
                                    <tbody>
                                        {workloads.map(w => (
                                            <tr key={w.id}>
                                                <td>{w.name}</td>
                                                <td>{w.query_count}</td>
                                                <td>
                                                    <div style={{display:'flex', gap: 4}}>
                                                        <button className="btn btn--secondary btn--sm" onClick={() => handleViewQueries(w.id)}>조회</button>
                                                        <button className="btn btn--secondary btn--sm" onClick={() => handleExecuteWorkload(w.id)}>▶ 실행</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'monitor' && (
                    <div className="form-stack">
                        <div className="card">
                            <div className="card__header">
                                <span>성능 모니터링 (Execution Time & Events)</span>
                                <select 
                                    className="select" 
                                    style={{ width: 240, height: 32, fontSize: 12 }} 
                                    value={monitorWorkloadId} 
                                    onChange={e => setMonitorWorkloadId(e.target.value)}
                                >
                                    <option value="ALL">전체 워크로드 보기</option>
                                    {workloads.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="card__body">
                                <PerformanceChart executions={filteredExecutions} tuningLogs={tuningLogs} height={300} />
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__header">실행 이력 및 지표 상세</div>
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead><tr><th>실행 일시</th><th>워크로드</th><th>소요 시간</th><th>Hit Ratio</th><th>I/O Read</th><th>관리</th></tr></thead>
                                    <tbody>
                                        {filteredExecutions.map(e => (
                                            <tr key={e.id} style={{background: selectedExecution?.id === e.id ? '#f0f7ff' : 'transparent'}}>
                                                <td>{formatKST(e.created_at)}</td>
                                                <td style={{fontWeight: 600}}>{e.workload_name}</td>
                                                <td>{e.execution_time_ms.toFixed(2)} ms</td>
                                                <td>{e.extended_metrics ? `${e.extended_metrics.buffer_hit_ratio}%` : '-'}</td>
                                                <td>{e.extended_metrics ? e.extended_metrics.blocks_read : '-'}</td>
                                                <td>
                                                    <button className="btn btn--secondary btn--sm" onClick={() => setSelectedExecution(e)}>
                                                        🔍 분석
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {selectedWorkloadForQueries && (
                <Modal title={`워크로드 쿼리 목록 (${selectedWorkloadForQueries.name})`} onClose={() => setSelectedWorkloadForQueries(null)} width={900}>
                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {selectedWorkloadForQueries.queries && selectedWorkloadForQueries.queries.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {selectedWorkloadForQueries.queries.map((q, idx) => (
                                    <div key={idx} style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, border: '1px solid #e5e5e5' }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Query #{idx + 1}</span>
                                        </div>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#2563eb', background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #eaeaea' }}>
                                            {q.sql}
                                        </pre>
                                        <div style={{ marginTop: 12 }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Parameters</span>
                                            <div style={{ marginTop: 4, fontSize: 12, fontFamily: 'var(--font-mono)', color: '#444' }}>
                                                {JSON.stringify(q.params)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state-small">생성된 쿼리 정보가 없습니다.</div>
                        )}
                    </div>
                </Modal>
            )}

            {selectedExecution && (
                <Modal title="성능 상세 분석" onClose={() => setSelectedExecution(null)} width={1000}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 24, borderBottom: '1px solid #eaeaea' }}>
                            <div>
                                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Workload Name</div>
                                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: '#111' }}>
                                    {selectedExecution.workload_name || 'Unknown Workload'}
                                </div>
                                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>ID: {selectedExecution.workload_id}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Executed At (KST)</div>
                                <div style={{ fontWeight: 600 }}>{formatKST(selectedExecution.created_at)}</div>
                            </div>
                        </div>

                        <div>
                            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#111827' }}>📊 Performance Metrics</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                <StatCard 
                                    label="Execution Time" 
                                    value={selectedExecution.execution_time_ms.toFixed(2)} 
                                    unit="ms" 
                                    color="#2563eb"
                                />
                                {selectedExecution.extended_metrics ? (
                                    <>
                                        <StatCard 
                                            label="Buffer Hit Ratio" 
                                            value={selectedExecution.extended_metrics.buffer_hit_ratio} 
                                            unit="%" 
                                            color={selectedExecution.extended_metrics.buffer_hit_ratio > 90 ? '#059669' : '#d97706'}
                                        />
                                        <StatCard 
                                            label="Disk Blocks Read" 
                                            value={selectedExecution.extended_metrics.blocks_read} 
                                        />
                                        <StatCard 
                                            label="Buffer Blocks Hit" 
                                            value={selectedExecution.extended_metrics.blocks_hit} 
                                        />
                                        <StatCard 
                                            label="Rows Returned" 
                                            value={selectedExecution.extended_metrics.tuples_returned} 
                                        />
                                        <StatCard 
                                            label="Rows Fetched" 
                                            value={selectedExecution.extended_metrics.tuples_fetched} 
                                        />
                                        <StatCard 
                                            label="Transactions" 
                                            value={selectedExecution.extended_metrics.transactions} 
                                        />
                                    </>
                                ) : (
                                    <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: 12 }}>
                                        No extended metrics available
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#111827' }}>⚙️ DB Parameter Snapshot</h4>
                            <div style={{ 
                                background: '#1e293b', 
                                color: '#e2e8f0', 
                                padding: '20px', 
                                borderRadius: 12, 
                                fontFamily: 'var(--font-mono)', 
                                fontSize: 13, 
                                maxHeight: '300px', 
                                overflowY: 'auto',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <pre style={{ margin: 0 }}>
                                    {JSON.stringify(selectedExecution.db_config_snapshot, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AdminDashboard;