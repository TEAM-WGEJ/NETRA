import React, { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { Plus, Minus, RotateCcw } from 'lucide-react';

const INITIAL_VIEW = { lat: 20, lng: 126, altitude: 2.2 };

const iconButtonStyle: React.CSSProperties = {
  width: '38px', height: '38px', background: '#fff', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer'
};

export default function App() {
  const globeEl = useRef<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.2;
      globeEl.current.pointOfView(INITIAL_VIEW, 1000);
    }
  }, []);

  useEffect(() => {
    fetch('/countries.geojson')
      .then((res) => res.json())
      .then((data) => setCountries(data.features))
      .catch(() => setCountries([]));
  }, []);

  const globeMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      color: '#bfe3ff',
      transparent: true,
      opacity: 0.92,
      shininess: 80,
    });
  }, []);

  const handleZoom = (delta: number) => {
    if (!globeEl.current) return;
    const pov = globeEl.current.pointOfView();
    const altitude = Math.min(3.5, Math.max(1.0, pov.altitude + delta));
    globeEl.current.pointOfView({ ...pov, altitude }, 400);
  };

  const handleResetView = () => {
    globeEl.current?.pointOfView(INITIAL_VIEW, 800);
  };

  // 시안에 맞춘 서비스 및 3D 공간 노드 데이터
  const networkServices = [
    {
      id: 'naver', name: 'naver.com', korName: '네이버', logo: 'N', color: '#03C75A',
      date: '2022. 03. 15', lastUse: '2024. 05. 20', retention: '2년 3개월', risk: '보통',
      nodes: [
        { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' },
        { id: 's1', name: '네이버', lat: 38.0, lng: 135.0, altitude: 0.25, logo: 'N', color: '#03C75A' },
        { id: 's2', name: '네이버 클라우드', lat: 30.0, lng: 145.0, altitude: 0.45, logo: '☁️', color: '#0284c7' },
        { id: 's3', name: '메가존 클라우드', lat: 20.0, lng: 155.0, altitude: 0.65, logo: 'M', color: '#6366f1' },
        { id: 's4', name: '외부 파트너 외 3개', lat: 10.0, lng: 165.0, altitude: 0.85, logo: '⋯', color: '#64748b' }
      ],
      arcs: [
        { startLat: 37.5, startLng: 127.0, endLat: 38.0, endLng: 135.0, color: '#03C75A' },
        { startLat: 38.0, startLng: 135.0, endLat: 30.0, endLng: 145.0, color: '#0284c7' },
        { startLat: 30.0, startLng: 145.0, endLat: 20.0, endLng: 155.0, color: '#6366f1' },
        { startLat: 20.0, startLng: 155.0, endLat: 10.0, endLng: 165.0, color: '#64748b' }
      ],
      chain: [
        { node: '나', type: '정보주체', desc: '최초 제공 (ID, 연락처)' },
        { node: '네이버', type: '1차 수집', desc: '서비스 운영 및 타겟 광고' },
        { node: '네이버 클라우드', type: '위탁', desc: '인프라 및 서버 스토리지' },
        { node: '메가존 클라우드', type: '재위탁', desc: '데이터 관리 파트너' },
        { node: '외 3개', type: '제3자', desc: '통계 분석 및 마케팅 연동' }
      ]
    },
    {
      id: 'temu', name: 'temu.com', korName: '테무', logo: '🛒', color: '#FF6600',
      date: '2024. 01. 15', lastUse: '2024. 05. 22', retention: '탈퇴 시까지', risk: '높음',
      nodes: [
        { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' },
        { id: 's1', name: 'PDD Holdings', lat: 31.2, lng: 121.4, altitude: 0.3, logo: '🛒', color: '#FF6600' },
        { id: 's2', name: '중국 물류사', lat: 25.0, lng: 115.0, altitude: 0.5, logo: '📦', color: '#ef4444' },
        { id: 's3', name: '광고 네트워크', lat: 18.0, lng: 105.0, altitude: 0.7, logo: '📢', color: '#dc2626' }
      ],
      arcs: [
        { startLat: 37.5, startLng: 127.0, endLat: 31.2, endLng: 121.4, color: '#FF6600' },
        { startLat: 31.2, startLng: 121.4, endLat: 25.0, endLng: 115.0, color: '#ef4444' },
        { startLat: 25.0, startLng: 115.0, endLat: 18.0, endLng: 105.0, color: '#dc2626' }
      ],
      chain: [
        { node: '나', type: '정보주체', desc: '배송지 주소, 카드 정보' },
        { node: 'PDD Holdings', type: '국외이전', desc: '상하이 본사 서버 전송' },
        { node: '중국 물류사', type: '제3자', desc: '현지 통관 및 배송 공유' },
        { node: '광고 네트워크', type: '제3자', desc: '행태정보 수집' }
      ]
    }
  ];

  // 메인 화면에 띄울 기본 아이콘들 ('나'를 중심으로 개인정보가 각 서비스로 흘러나가는 모습)
  const activeElements = selectedService ? selectedService.nodes : [
    { id: 'me', name: '나', lat: 36.5, lng: 127.5, altitude: 0.05, logo: '👤', color: '#3b82f6' },
    { id: 'naver', name: '네이버', lat: 37.5, lng: 129.0, altitude: 0.2, logo: 'N', color: '#03C75A' },
    { id: 'insta', name: '인스타그램', lat: 25.0, lng: 110.0, altitude: 0.3, logo: '📷', color: '#E1306C' },
    { id: 'temu', name: '테무', lat: 45.0, lng: 140.0, altitude: 0.25, logo: '🛒', color: '#FF6600' },
    { id: 'cloud', name: '클라우드', lat: 15.0, lng: 135.0, altitude: 0.35, logo: '☁️', color: '#0284c7' }
  ];

  // 기본 상태의 arc는 '나'로부터 각 서비스로 개인정보가 흘러나가는 방향을 표현 (dash 애니메이션이 흐름 방향을 보여줌)
  const meNode = activeElements.find((n: any) => n.id === 'me');
  const defaultArcs = meNode ? activeElements
    .filter((n: any) => n.id !== 'me')
    .map((node: any) => ({
      startLat: meNode.lat, startLng: meNode.lng,
      endLat: node.lat, endLng: node.lng,
      color: 'rgba(37,99,235,0.45)'
    })) : [];

  const activeArcs = selectedService ? selectedService.arcs : defaultArcs;

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f4f6f9', color: '#1e293b', margin: 0, overflow: 'hidden', fontFamily: 'sans-serif', position: 'relative' }}>
      
      {/* 상단 헤더 영역 */}
      <div style={{ position: 'absolute', top: '24px', left: '32px', right: '32px', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#2563eb', letterSpacing: '1.5px' }}>PRIVACY GLOBE</span>
          <h1 style={{ margin: '4px 0 6px 0', fontSize: '22px', color: '#0f172a', fontWeight: '800' }}>당신의 개인정보, 어디로 흘러가고 있을까요?</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>3D 지구본에서 연결된 서비스를 탐색해보세요.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', pointerEvents: 'auto' }}>
          <div style={{ width: '38px', height: '38px', background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer' }}>🔔</div>
          <div style={{ width: '38px', height: '38px', background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer' }}>☰</div>
        </div>
      </div>

      {/* 좌측 하단 요약 카드 (시안 하단 스타일) */}
      <div style={{
        position: 'absolute', bottom: '90px', left: '32px', zIndex: 10, pointerEvents: 'none',
        background: '#ffffff', padding: '16px 24px', borderRadius: '20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)', display: 'flex', gap: '24px', border: '1px solid #e2e8f0'
      }}>
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>연결된 서비스</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>27 개</p>
        </div>
        <div style={{ width: '1px', background: '#e2e8f0' }} />
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>전송 중인 정보</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>142 건</p>
        </div>
      </div>

      {/* 하단 네비게이션 바 (시안 하단 탭 스타일) */}
      <div style={{
        position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
        background: '#ffffff', padding: '10px 30px', borderRadius: '35px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)', display: 'flex', gap: '40px', border: '1px solid #e2e8f0', alignItems: 'center'
      }}>
        <div onClick={() => setSelectedService(null)} style={{ textAlign: 'center', cursor: 'pointer', color: selectedService ? '#94a3b8' : '#2563eb' }}>
          <div style={{ fontSize: '16px' }}>🌍</div>
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>지구본</span>
        </div>
        <div style={{ textAlign: 'center', cursor: 'pointer', color: '#94a3b8' }}>
          <div style={{ fontSize: '16px' }}>🔗</div>
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>관계망</span>
        </div>
        <div style={{ textAlign: 'center', cursor: 'pointer', color: '#94a3b8' }}>
          <div style={{ fontSize: '16px' }}>📊</div>
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>정보 흐름</span>
        </div>
        <div style={{ textAlign: 'center', cursor: 'pointer', color: '#94a3b8' }}>
          <div style={{ fontSize: '16px' }}>👤</div>
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>내 활동</span>
        </div>
      </div>

      {/* 지구본 아래 은은한 글로우/그림자 */}
      <div style={{
        position: 'absolute', top: '54%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '520px', height: '520px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(37,99,235,0) 70%)',
        filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none'
      }} />

      {/* 3D 지구본 (레퍼런스 시안과 같은 광택 있는 하늘색 유리구슬 + 반투명 대륙 스타일) */}
      <Globe
        ref={globeEl}
        width={windowSize.width}
        height={windowSize.height}
        globeMaterial={globeMaterial}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={true}
        atmosphereColor="#8ec9f5"
        atmosphereAltitude={0.18}

        polygonsData={countries}
        polygonCapColor={() => 'rgba(255,255,255,0.35)'}
        polygonSideColor={() => 'rgba(255,255,255,0.12)'}
        polygonStrokeColor={() => 'rgba(255,255,255,0.6)'}
        polygonAltitude={0.006}

        htmlElementsData={activeElements}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={(d: any) => d.altitude || 0.25}
        htmlElement={(d: any) => {
          const el = document.createElement('div');
          el.style.pointerEvents = 'auto';
          el.style.cursor = 'pointer';

          const bgCol = d.color || '#2563eb';
          const txt = d.logo || 'N';
          const displayName = d.name;

          el.title = displayName;
          el.innerHTML = `
            <div style="
              width: 46px;
              height: 46px;
              background: #ffffff;
              border-radius: 14px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 8px 20px rgba(15,23,42,0.15);
              border: 1px solid rgba(226,232,240,0.9);
              pointer-events: auto;
              transition: transform 0.2s;
            ">
              <div style="
                width: 28px;
                height: 28px;
                background: ${bgCol};
                color: #fff;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 12px;
              ">
                ${txt}
              </div>
            </div>
          `;

          el.onclick = (e) => {
            e.stopPropagation();
            if (!selectedService && d.id !== 'me') {
              // 네이버나 테무 클릭 시 해당 체인으로 전환
              const found = networkServices.find(s => s.id === d.id || s.name.includes(d.name));
              if (found) setSelectedService(found);
              else setSelectedService(networkServices[0]); // 기본은 네이버로 연결
            }
          };

          return el;
        }}

        arcsData={activeArcs}
        arcColor="color"
        arcDashLength={0.3}
        arcDashGap={0.35}
        arcDashAnimateTime={1500}
        arcStroke={1.5}
        arcAltitudeAutoScale={2.2}
      />

      {/* 지구본 우측 줌/리셋 컨트롤 */}
      <div style={{
        position: 'absolute', top: '50%', right: '24px', transform: 'translateY(-50%)', zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: '10px'
      }}>
        <button onClick={() => handleZoom(-0.4)} style={iconButtonStyle}><Plus size={16} color="#334155" /></button>
        <button onClick={() => handleZoom(0.4)} style={iconButtonStyle}><Minus size={16} color="#334155" /></button>
        <button onClick={handleResetView} style={iconButtonStyle}><RotateCcw size={14} color="#334155" /></button>
      </div>

      {/* 우측 상세 정보 패널 (시안의 우측 카드 스타일 완벽 재현) */}
      {selectedService && (
        <div style={{
          position: 'absolute', top: '24px', right: '24px', bottom: '24px', width: '440px',
          background: '#ffffff', color: '#0f172a', zIndex: 30, borderRadius: '28px', 
          boxShadow: '-15px 0 50px rgba(0,0,0,0.12)', padding: '28px', boxSizing: 'border-box', 
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          border: '1px solid #e2e8f0', overflowY: 'auto'
        }}>
          <div>
            {/* 상단 닫기 및 서비스 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', background: selectedService.color, color: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {selectedService.logo}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>{selectedService.korName}</h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{selectedService.name}</span>
                </div>
              </div>
              <button onClick={() => setSelectedService(null)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '14px', cursor: 'pointer', color: '#64748b', fontWeight: 'bold' }}>✕</button>
            </div>

            {/* 탭 메뉴 (개요 / 전송 정보 / 관계 서비스) */}
            <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px', fontSize: '13px', fontWeight: 'bold' }}>
              <span style={{ color: '#2563eb', borderBottom: '2px solid #2563eb', paddingBottom: '12px', marginBottom: '-13px' }}>개요</span>
              <span style={{ color: '#94a3b8', cursor: 'pointer' }}>전송 정보</span>
              <span style={{ color: '#94a3b8', cursor: 'pointer' }}>관계 서비스</span>
              <span style={{ color: '#94a3b8', cursor: 'pointer' }}>내 활동</span>
            </div>

            {/* 서비스 정보 박스 */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '20px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div><span style={{ color: '#64748b', marginRight: '10px' }}>가입일</span><span style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedService.date}</span></div>
                <div><span style={{ color: '#64748b', marginRight: '10px' }}>최근 이용</span><span style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedService.lastUse}</span></div>
                <div><span style={{ color: '#64748b', marginRight: '10px' }}>보유 기간</span><span style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedService.retention}</span></div>
              </div>
              <div style={{ textAlign: 'center', background: '#fff', padding: '10px 16px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>노출 수준</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: selectedService.risk === '높음' ? '#dc2626' : '#2563eb' }}>{selectedService.risk}</span>
              </div>
            </div>

            {/* 연결된 관계망 (시안의 흐름도 구조) */}
            <h4 style={{ fontSize: '14px', color: '#0f172a', marginBottom: '14px', fontWeight: '800' }}>연결된 관계망</h4>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '20px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflowX: 'auto' }}>
              {selectedService.chain.map((c: any, idx: number) => (
                <React.Fragment key={idx}>
                  <div style={{ textAlign: 'center', minWidth: '55px' }}>
                    <div style={{ width: '32px', height: '32px', background: idx === 0 ? '#3b82f6' : '#fff', color: idx === 0 ? '#fff' : '#0f172a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px auto', fontSize: '12px', fontWeight: 'bold', border: '1px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                      {idx === 0 ? '👤' : c.node[0]}
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#334155', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.node}</span>
                  </div>
                  {idx < selectedService.chain.length - 1 && <span style={{ color: '#cbd5e1', fontSize: '14px' }}>→</span>}
                </React.Fragment>
              ))}
            </div>

            {/* 상세 설명 리스트 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedService.chain.map((c: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '8px 12px', background: '#f8fafc', borderRadius: '10px' }}>
                  <span style={{ fontWeight: 'bold', color: '#334155' }}>{c.node} ({c.type})</span>
                  <span style={{ color: '#64748b' }}>{c.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 하단 버튼 */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button style={{ flex: 1, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '14px', borderRadius: '16px', fontWeight: 'bold', cursor: 'pointer', color: '#334155', fontSize: '13px' }}>
              정보 관리
            </button>
            <button 
              onClick={() => alert('해당 관계망 내 데이터 제공 동의 일괄 철회 완료')}
              style={{ flex: 1.5, background: '#2563eb', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '16px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', boxShadow: '0 4px 15px rgba(37,99,235,0.3)' }}
            >
              탈퇴 페이지로 이동 ↗
            </button>
          </div>
        </div>
      )}

    </div>
  );
}