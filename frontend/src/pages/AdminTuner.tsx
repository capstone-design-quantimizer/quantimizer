import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import type { DBTuneResult, Workload, WorkloadExecution, EquityPoint } from '../types/index';
import EquityChart from '../components/EquityChart';
import { Modal } from '../components/Shared';

interface Props {
    api: (url: string, opts?: any) => Promise<Response>;
}

const AdminTuner: React.FC<Props> = ({ api }) => {
    const [activeTab, setActiveTab] = useState<'tuning' | 'workload' | 'monitor'>('tuning');
    
    // Tuning State
    const [tuneFile, setTuneFile] = useState<File | null>(null);
    const [tuneResult, setTuneResult] = useState<DBTuneResult | null>(null);
    const [tuningLoading, setTuningLoading] = useState(false);

    // Workload State
    const [workloads, setWorkloads] = useState<Workload[]>([]);
    const [executions, setExecutions] = useState<WorkloadExecution[]>([]);
    const [wlForm, setWlForm] = useState({ name: '', description: '', count: 100 });
    const [wlLoading, setWlLoading] = useState(false);

    // Monitor State
    const [selectedSnapshot, setSelectedSnapshot] = useState<Record<string, string> | null>(null);

    // Data Loading
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
        if (activeTab === 'workload') loadWorkloads();
        if (activeTab === 'monitor') {
            loadWorkloads(); // For name mapping
            loadExecutions();
        }
    }, [activeTab]);

    // Handlers: Tuning
    const handleTuneUpload = async () => {
        if (!tuneFile) return Swal.fire("알림", "파일을 선택해주세요.", "warning");
        setTuningLoading(true);
        const formData = new FormData();
        formData.append('file', tuneFile);
        try {
            const res = await api("/admin/tune", { method: "POST", body: formData }); // Content-Type handled by api wrapper logic in App.tsx
            if (res.ok) {
                setTuneResult(await res.json());
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

    // Handlers: Workload
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
            text: "실제 DB 쿼리가 실행되며 시간이 소요될 수 있습니다. 진행하시겠습니까?",
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

    // Data Processing: Monitor
    const chartData: EquityPoint[] = useMemo(() => {
        // Map executions to EquityPoint format for chart reuse
        // x: date, y: execution_time_ms
        return executions
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(e => ({
                date: e.created_at,
                equity: e.execution_time_ms
            }));
    }, [executions]);

    const enrichedExecutions = useMemo(() => {
        return executions.map(e => ({
            ...e,
            workload_name: workloads.find(w => w.id === e.workload_id)?.name || 'Unknown'
        }));
    }, [executions, workloads]);

    return (
        <div className="builder-container">
            {/* Admin Tabs */}
            <div className="nav-tabs" style={{ marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <button 
                    className={`nav-tab ${activeTab === 'tuning' ? 'nav-tab--active' : ''}`}
                    onClick={() => setActiveTab('tuning')}
                >
                    DB 파라미터 튜닝
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'workload' ? 'nav-tab--active' : ''}`}
                    onClick={() => setActiveTab('workload')}
                >
                    워크로드 생성 및 실행
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'monitor' ? 'nav-tab--active' : ''}`}
                    onClick={() => setActiveTab('monitor')}
                >
                    성능 모니터링
                </button>
            </div>

            {/* TAB 1: DB Tuning */}
            {activeTab === 'tuning' && (
                <div className="card">
                    <div className="card__header">Knob 튜닝 자동화</div>
                    <div className="card__body">
                        <p className="card-desc">
                            AI 모델이 추천한 최적의 파라미터 구성 파일(JSON)을 업로드하여 PostgreSQL에 자동 적용합니다.<br/>
                            일부 설정은 DB 재시작이 필요할 수 있습니다.
                        </p>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
                            <input 
                                type="file" 
                                accept=".json" 
                                onChange={e => { if (e.target.files?.[0]) setTuneFile(e.target.files[0]); }}
                                className="input" 
                                style={{ paddingTop: 6, height: 40 }}
                            />
                            <button 
                                className="btn btn--primary" 
                                onClick={handleTuneUpload} 
                                disabled={tuningLoading || !tuneFile}
                                style={{ minWidth: 120 }}
                            >
                                {tuningLoading ? '적용 중...' : '설정 적용하기'}
                            </button>
                        </div>

                        {tuneResult && (
                            <div style={{ marginTop: 24, padding: 20, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>적용 결과 리포트</h4>
                                <div className="form-stack">
                                    <div className="metric-box" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
                                        <span>총 적용된 파라미터</span>
                                        <span style={{ fontSize: 20 }}>{tuneResult.applied_count}개</span>
                                    </div>
                                    {tuneResult.restart_required_params.length > 0 ? (
                                        <div style={{ padding: 16, background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 6, color: '#c53030' }}>
                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ DB 재시작 필요 항목</div>
                                            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                                                다음 파라미터들은 <b>PostgreSQL 서비스를 재시작</b>해야 적용됩니다:<br/>
                                                <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4, marginTop: 4, display: 'inline-block' }}>
                                                    {tuneResult.restart_required_params.join(", ")}
                                                </code>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: 16, background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 6, color: '#2f855a' }}>
                                            ✅ 모든 설정이 즉시 적용되었습니다.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: Workload Management */}
            {activeTab === 'workload' && (
                <div className="builder-split-view">
                    <div className="card" style={{ flex: 1 }}>
                        <div className="card__header">새 워크로드 생성</div>
                        <div className="card__body form-stack">
                            <div>
                                <label className="meta-label">워크로드 이름</label>
                                <input className="input" value={wlForm.name} onChange={e => setWlForm({...wlForm, name: e.target.value})} placeholder="예: 전략 백테스트 부하 A" />
                            </div>
                            <div>
                                <label className="meta-label">설명</label>
                                <input className="input" value={wlForm.description} onChange={e => setWlForm({...wlForm, description: e.target.value})} placeholder="간단한 설명..." />
                            </div>
                            <div>
                                <label className="meta-label">생성할 쿼리 수</label>
                                <input className="input" type="number" value={wlForm.count} onChange={e => setWlForm({...wlForm, count: Number(e.target.value)})} min={1} max={1000} />
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                    시스템 내의 유효한 전략 생성 로직을 사용하여 랜덤 쿼리를 생성합니다.
                                </p>
                            </div>
                            <div className="form-actions">
                                <button className="btn btn--primary" onClick={handleCreateWorkload} disabled={wlLoading}>
                                    {wlLoading ? '생성 중...' : '생성하기'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                        <div className="card__header">워크로드 목록</div>
                        <div className="table-wrapper" style={{ flex: 1 }}>
                            <table className="table">
                                <thead><tr><th>이름</th><th>쿼리 수</th><th>생성일</th><th>관리</th></tr></thead>
                                <tbody>
                                    {workloads.map(w => (
                                        <tr key={w.id}>
                                            <td style={{ fontWeight: 600 }}>{w.name}</td>
                                            <td>{w.query_count}</td>
                                            <td>{new Date(w.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button className="btn btn--secondary btn--sm" onClick={() => handleExecuteWorkload(w.id)} disabled={wlLoading}>
                                                    ▶ 실행
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {workloads.length === 0 && <tr><td colSpan={4} className="empty-table">생성된 워크로드가 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: Monitor */}
            {activeTab === 'monitor' && (
                <div className="form-stack">
                    <div className="card">
                        <div className="card__header">성능 추이 그래프 (Execution Time)</div>
                        <div className="card__body">
                            {chartData.length > 0 ? (
                                <>
                                    <EquityChart data={chartData} height={300} />
                                    <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                                        Y축: 실행 시간 (ms) / X축: 실행 시점
                                    </p>
                                </>
                            ) : (
                                <div className="empty-state-small">실행 이력이 없습니다.</div>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card__header">실행 이력 상세</div>
                        <div className="table-wrapper">
                            <table className="table">
                                <thead><tr><th>실행 일시</th><th>워크로드명</th><th>소요 시간(ms)</th><th>DB 상태</th></tr></thead>
                                <tbody>
                                    {enrichedExecutions.map(e => (
                                        <tr key={e.id}>
                                            <td>{new Date(e.created_at).toLocaleString()}</td>
                                            <td style={{ fontWeight: 600 }}>{e.workload_name}</td>
                                            <td>{e.execution_time_ms.toFixed(2)} ms</td>
                                            <td>
                                                <button className="btn btn--secondary btn--sm" onClick={() => setSelectedSnapshot(e.db_config_snapshot)}>
                                                    🔍 스냅샷 보기
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

            {selectedSnapshot && (
                <Modal title="DB 파라미터 스냅샷" onClose={() => setSelectedSnapshot(null)}>
                    <div style={{ maxHeight: '60vh', overflowY: 'auto', background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                        <pre style={{ margin: 0, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                            {JSON.stringify(selectedSnapshot, null, 2)}
                        </pre>
                    </div>
                    <div style={{ marginTop: 16, textAlign: 'right' }}>
                        <button className="btn btn--secondary" onClick={() => setSelectedSnapshot(null)}>닫기</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AdminTuner;