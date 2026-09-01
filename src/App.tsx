import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

export default function App() {
  const globeEl = useRef<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.2;
      globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
    }
  }, []);

  // 지구본 공간 상에 펼쳐질 '추상적 데이터 관계망(Chain)' 노드 데이터
  const networkServices = [
    {
      id: 'naver', name: '네이버', logo: 'N', color: '#03C75A',
      desc: '포털 서비스 및 맞춤형 광고 개인정보 흐름',
      // 지구본 위 특정 위치를 점령하는 게 아니라, 3D 구체 주변 공간에 고도를 주어 둥둥 띄움
      nodes: [
        { id: 'me', name: '나 (정보주체)', lat: 10, lng: 0, altitude: 0.1, type: '출발지', color: '#3b82f6' },
        { id: 's1', name: '네이버 (1차 수집)', lat: 25, lng: 15, altitude: 0.3, type: '수집/이용', color: '#03C75A' },
        { id: 's2', name: '네이버 클라우드', lat: 40, lng: 30, altitude: 0.5, type: '업무 위탁', color: '#10b981' },
        { id: 's3', name: '외부 파트너사 외 3개', lat: 55, lng: 45, altitude: 0.7, type: '제3자 제공', color: '#f59e0b' }
      ],
      arcs: [
        { startLat: 10, startLng: 0, endLat: 25, endLng: 15, color: '#03C75A', label: '수집' },
        { startLat: 25, startLng: 15, endLat: 40, endLng: 30, color: '#10b981', label: '위탁' },
        { startLat: 40, startLng: 30, endLat: 55, endLng: 45, color: '#f59e0b', label: '제공' }
      ],
      chain: [
        { level: 1, node: '나 (정보주체)', type: '출발지', detail: 'ID, 연락처, 검색 키워드 수집' },
        { level: 2, node: '네이버', type: '1차 수집/이용', detail: '서비스 운영 및 타겟 마케팅 활용' },
        { level: 3, node: '네이버 클라우드', type: '업무 위탁', detail: '인프라 구축 및 서버 스토리지 관리' },
        { level: 4, node: '외부 파트너사 외 3개', type: '제3자 제공', detail: '통계 분석 및 광고 연동' }
      ]
    },
    {
      id: 'temu', name: '테무 (Temu)', logo: '🛒', color: '#FF6600',
      desc: '해외 직구 플랫폼 대규모 국외 이전 및 위탁 구조',
      nodes: [
        { id: 'me', name: '나 (정보주체)', lat: -10, lng: 0, altitude: 0.1, type: '출발지', color: '#3b82f6' },
        { id: 's1', name: 'PDD Holdings', lat: -25, lng: -15, altitude: 0.3, type: '국외이전', color: '#FF6600' },
        { id: 's2', name: '중국 협력 물류사', lat: -40, lng: -30, altitude: 0.5, type: '제3자 제공', color: '#ef4444' },
        { id: 's3', name: '글로벌 타겟 광고망', lat: -55, lng: -45, altitude: 0.7, type: '제3자 제공', color: '#dc2626' }
      ],
      arcs: [
        { startLat: -10, startLng: 0, endLat: -25, endLng: -15, color: '#FF6600', label: '이전' },
        { startLat: -25, startLng: -15, endLat: -40, endLng: -30, color: '#ef4444', label: '물류위탁' },
        { startLat: -40, startLng: -30, endLat: -55, endLng: -45, color: '#dc2626', label: '광고제공' }
      ],
      chain: [
        { level: 1, node: '나 (정보주체)', type: '출발지', detail: '배송지 주소, 결제 카드, 기기 식별자' },
        { level: 2, node: 'PDD Holdings', type: '1차 수집/국외이전', detail: '상하이 본사 서버로 실시간 데이터 전송' },
        { level: 3, node: '중국 협력 물류사', type: '제3자 제공', detail: '현지 통관 및 배송 목적의 정보 공유' },
        { level: 4, node: '글로벌 타겟 광고망', type: '제3자 제공', detail: '행태정보 기반 쇼핑 관심사 수집' }
      ]
    }
  ];

  // 선택된 서비스가 없으면 전체 서비스 대표 아이콘들을 지구본에 띄움
  const activeElements = selectedService ? selectedService.nodes : [
    { id: 'naver', name: '네이버', lat: 25, lng: 15, altitude: 0.3, color: '#03C75A', logo: 'N' },
    { id: 'temu', name: '테무 (Temu)', lat: -25, lng: -15, altitude: 0.3, color: '#FF6600', logo: '🛒' }
  ];

  const activeArcs = selectedService ? selectedService.arcs : [];

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#090d16', color: '#f8fafc', margin: 0, overflow: 'hidden', fontFamily: 'sans-serif', position: 'relative' }}>
      
      {/* 상단 타이틀 */}
      <div style={{ position: 'absolute', top: '30px', left: '30px', zIndex: 10, pointerEvents: 'none' }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#38bdf8', letterSpacing: '1px' }}>ABSTRACT PRIVACY GLOBE</p>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '22px', color: '#ffffff' }}>지구본 공간 기반 추상적 데이터 관계망</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          {selectedService ? `"${selectedService.name}"의 3D 연쇄 관계망 체인 전개 중` : '서비스를 클릭하여 지구본 공간 상에 추상적 네트워크를 펼쳐보세요.'}
        </p>
      </div>

      {/* 하단 제어 및 초기화 버튼 */}
      <div style={{
        position: 'absolute', bottom: '25px', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
        background: 'rgba(30, 41, 59, 0.8)', padding: '10px 25px', borderRadius: '30px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex', gap: '20px', border: '1px solid #334155', alignItems: 'center', backdropFilter: 'blur(5px)'
      }}>
        <span style={{ fontSize: '12px', color: '#cbd5e1' }}>🌐 3D 추상 공간 모드</span>
        {selectedService && (
          <button 
            onClick={() => setSelectedService(null)}
            style={{ background: '#38bdf8', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', color: '#090d16' }}
          >
            지구본 초기화
          </button>
        )}
      </div>

      {/* 3D 지구본 (배경은 구체 형태이되, 위에는 추상적 노드와 아크선만 공중에 떠 있음) */}
      <Globe
        ref={globeEl}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        
        htmlElementsData={activeElements}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={(d: any) => d.altitude || 0.3}
        htmlElement={(d: any) => {
          const el = document.createElement('div');
          el.style.pointerEvents = 'auto';
          el.style.cursor = 'pointer';

          const bgCol = d.color || '#3b82f6';
          const txt = d.logo || d.name[0];
          const displayName = d.name;

          el.innerHTML = `
            <div style="
              display: flex; 
              align-items: center; 
              gap: 8px; 
              background: rgba(15, 23, 42, 0.9); 
              padding: 6px 14px 6px 6px; 
              border-radius: 20px; 
              box-shadow: 0 4px 20px rgba(0,0,0,0.5); 
              border: 2px solid ${bgCol};
              pointer-events: auto;
              backdrop-filter: blur(4px);
            ">
              <div style="
                width: 28px; 
                height: 28px; 
                background: ${bgCol}; 
                color: #fff; 
                border-radius: 50%; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-weight: bold; 
                font-size: 12px;
              ">
                ${txt}
              </div>
              <span style="font-size: 12px; font-weight: bold; color: #ffffff; white-space: nowrap;">${displayName}</span>
            </div>
          `;

          el.onclick = (e) => {
            e.stopPropagation();
            if (!selectedService) {
              const found = networkServices.find(s => s.id === d.id);
              if (found) setSelectedService(found);
            }
          };

          return el;
        }}

        arcsData={activeArcs}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={1200}
        arcStroke={2}
      />

      {/* 우측 상세 패널 (선택 시 추상적 관계망 체인 표시) */}
      {selectedService && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px', bottom: '20px', width: '400px',
          background: 'rgba(15, 23, 42, 0.95)', color: '#f8fafc', zIndex: 30, borderRadius: '24px', 
          boxShadow: '-10px 0 40px rgba(0,0,0,0.5)', padding: '24px', boxSizing: 'border-box', 
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          border: '1px solid #334155', backdropFilter: 'blur(10px)', overflowY: 'auto'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', background: selectedService.color, color: '#fff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {selectedService.logo}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>{selectedService.name}</h3>
                  <span style={{ fontSize: '11px', color: '#38bdf8' }}>추상적 3D 관계망 체인 전개됨</span>
                </div>
              </div>
              <button onClick={() => setSelectedService(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <h4 style={{ fontSize: '14px', color: '#38bdf8', marginBottom: '14px' }}>⛓️ 연쇄 데이터 흐름 구조</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {selectedService.chain.map((item: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
                  {idx < selectedService.chain.length - 1 && (
                    <div style={{ position: 'absolute', top: '24px', left: '11px', width: '2px', height: 'calc(100% + 12px)', background: '#38bdf844' }} />
                  )}
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#38bdf8', color: '#090d16', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, flexShrink: 0 }}>
                    {item.level}
                  </div>
                  <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px 16px', borderRadius: '12px', flexGrow: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>{item.node}</span>
                      <span style={{ fontSize: '10px', background: '#090d16', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', border: '1px solid #334155' }}>{item.type}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button 
            onClick={() => alert('해당 관계망 전체 동의 일괄 철회 요청 완료')}
            style={{
              width: '100%', background: '#ef4444', color: '#ffffff', border: 'none',
              padding: '14px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
              boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)'
            }}
          >
            관계망 내 데이터 제공 동의 일괄 철회 ↗
          </button>
        </div>
      )}

    </div>
  );
}