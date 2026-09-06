import React, { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { Plus, Minus, RotateCcw } from 'lucide-react';

const INITIAL_VIEW = { lat: 20, lng: 126, altitude: 2.2 };

// data/services/*.json 의 국외이전 국가명 -> 대략적인 국가 중심 좌표
// (원문 공시는 국가명 단위까지만 밝히므로, 그 이상의 정밀도는 임의로 만들지 않는다)
const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  일본: { lat: 35.6762, lng: 139.6503 },
  벨기에: { lat: 50.8503, lng: 4.3517 },
  베트남: { lat: 21.0278, lng: 105.8342 },
  미국: { lat: 38.9072, lng: -77.0369 },
  호주: { lat: -35.2809, lng: 149.1300 },
  네덜란드: { lat: 52.3676, lng: 4.9041 },
  영국: { lat: 51.5072, lng: -0.1276 },
  중국: { lat: 39.9042, lng: 116.4074 },
  싱가포르: { lat: 1.3521, lng: 103.8198 },
  말레이시아: { lat: 3.1390, lng: 101.6869 },
  아일랜드: { lat: 53.3498, lng: -6.2603 },
  인도: { lat: 28.6139, lng: 77.2090 },
  대만: { lat: 25.0330, lng: 121.5654 },
  덴마크: { lat: 55.6761, lng: 12.5683 },
  독일: { lat: 52.5200, lng: 13.4050 },
  멕시코: { lat: 19.4326, lng: -99.1332 },
  브라질: { lat: -15.7939, lng: -47.8828 },
  스웨덴: { lat: 59.3293, lng: 18.0686 },
  스페인: { lat: 40.4168, lng: -3.7038 },
  아이슬란드: { lat: 64.1466, lng: -21.9426 },
  이탈리아: { lat: 41.9028, lng: 12.4964 },
  칠레: { lat: -33.4489, lng: -70.6693 },
  캐나다: { lat: 45.4215, lng: -75.6972 },
  코스타리카: { lat: 9.9281, lng: -84.0907 },
  프랑스: { lat: 48.8566, lng: 2.3522 },
  핀란드: { lat: 60.1699, lng: 24.9384 },
  필리핀: { lat: 14.5995, lng: 120.9842 },
};

// 원문 국가명에 붙은 부연 설명을 떼고 좌표 테이블의 키로 맞춘다.
// (예: '아이슬란드(대체 작동 사이트, 기본 저장 사이트에 오류가 발생하는 경우 이용됨)' -> '아이슬란드')
const normalizeCountry = (name: string) => name.replace(/\s*[(（].*$/, '').trim();

// arc 고도를 두 지점 사이 각거리(라디안)에 비례해 정하되 상한을 둔다.
// 단거리(국내·인접국)는 최소 0.08로 봉긋하게 띄워 보이게 하고,
// 장거리(한국->미국·호주 등)는 0.3에서 캡을 걸어 화면 밖으로 치솟지 않게 한다.
const arcAltitudeByDistance = (d: any) => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const lat1 = toRad(d.startLat), lat2 = toRad(d.endLat);
  const dLng = toRad(d.endLng - d.startLng);
  const cosAngle = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle))); // 0 ~ PI
  return Math.min(0.3, Math.max(0.08, angle * 0.25));
};

// 모든 arc에 공통으로 쓰는 색 (기본 화면과 서비스 선택 화면이 같은 톤을 유지하도록 통일).
// 시작점(나/수집자) 쪽은 옅고 도착점 쪽으로 갈수록 진해져 흐름 방향이 읽힌다.
const ARC_GRADIENT = ['rgba(37,99,235,0.2)', 'rgba(37,99,235,0.85)'];

const iconButtonStyle: React.CSSProperties = {
  width: '38px', height: '38px', background: '#fff', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer'
};

export default function App() {
  const globeEl = useRef<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [kakaomobilityRaw, setKakaomobilityRaw] = useState<any>(null);
  const [temuRaw, setTemuRaw] = useState<any>(null);
  const [naverRaw, setNaverRaw] = useState<any>(null);
  const [coupangRaw, setCoupangRaw] = useState<any>(null);
  const [netflixRaw, setNetflixRaw] = useState<any>(null);
  const [googleRaw, setGoogleRaw] = useState<any>(null);
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

  // pipeline/extract_kakaomobility.py 로 실제 처리방침 표에서 뽑아낸 데이터
  useEffect(() => {
    fetch('/data/kakaomobility.json')
      .then((res) => res.json())
      .then(setKakaomobilityRaw)
      .catch(() => setKakaomobilityRaw(null));
  }, []);

  // data/services/temu.json - 실제 브라우저로 방문해 수기로 옮긴 위탁/국외이전 표 (미검증 초안, service.verificationStatus 참고)
  useEffect(() => {
    fetch('/data/temu.json')
      .then((res) => res.json())
      .then(setTemuRaw)
      .catch(() => setTemuRaw(null));
  }, []);

  // pipeline/extract_naver.py 로 네이버의 공개 정책 JSON API에서 그대로 받아온 데이터 (자동화, 봇 탐지 없음)
  useEffect(() => {
    fetch('/data/naver.json')
      .then((res) => res.json())
      .then(setNaverRaw)
      .catch(() => setNaverRaw(null));
  }, []);

  // pipeline/extract_coupang.py 로 실제 처리방침 표에서 뽑아낸 데이터
  useEffect(() => {
    fetch('/data/coupang.json')
      .then((res) => res.json())
      .then(setCoupangRaw)
      .catch(() => setCoupangRaw(null));
  }, []);

  // pipeline/extract_netflix.py 로 한국 이용자 대상 위탁·국외이전 표에서 뽑아낸 데이터
  useEffect(() => {
    fetch('/data/netflix.json')
      .then((res) => res.json())
      .then(setNetflixRaw)
      .catch(() => setNetflixRaw(null));
  }, []);

  // pipeline/extract_google.py 로 한국 거주자용 부록 문서에서 뽑아낸 데이터
  useEffect(() => {
    fetch('/data/google.json')
      .then((res) => res.json())
      .then(setGoogleRaw)
      .catch(() => setGoogleRaw(null));
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

  // 실제 처리방침 표(data/services/kakaomobility.json)에서 뽑은 카카오모빌리티 서비스 노드
  // 국외이전 4건은 원문 그대로의 국가/업체/목적/보유기간을 사용하고,
  // 국내 위탁·제3자제공은 개별 주소가 공시되지 않으므로 임의 좌표를 만들지 않고 집계 노드로만 표현한다.
  const kakaomobilityService = useMemo(() => {
    if (!kakaomobilityRaw) return null;

    const meNode = { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' };
    const collectorNode = { id: 'kakaomobility-hq', name: '카카오모빌리티', lat: 37.5, lng: 129.5, altitude: 0.2, logo: 'K', color: '#000000' };
    const consignmentNode = {
      id: 'kakaomobility-consignment', name: `국내 수탁사 ${kakaomobilityRaw.consignment.length}곳`,
      lat: 34.5, lng: 132.0, altitude: 0.35, logo: '🏢', color: '#64748b'
    };
    const overseasPalette = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];
    const overseasNodes = kakaomobilityRaw.overseasTransfer.map((t: any, idx: number) => {
      const base = COUNTRY_COORDS[t.country] || { lat: 0, lng: 0 };
      return {
        id: `kakaomobility-overseas-${idx}`,
        name: `${t.recipient} (${t.country})`,
        // 같은 국가로 이전되는 업체가 둘 이상이면 지구본 위에서 겹치지 않도록 살짝 띄운다 (표시상의 구분일 뿐 실제 좌표 아님)
        lat: base.lat, lng: base.lng + idx * 1.2,
        altitude: 0.4 + idx * 0.05, logo: '🌐', color: overseasPalette[idx % overseasPalette.length],
        detail: t,
      };
    });

    const nodes = [meNode, collectorNode, consignmentNode, ...overseasNodes];
    const arcs = [
      { startLat: meNode.lat, startLng: meNode.lng, endLat: collectorNode.lat, endLng: collectorNode.lng, color: '#000000' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: consignmentNode.lat, endLng: consignmentNode.lng, color: '#64748b' },
      ...overseasNodes.map((n: any) => ({
        startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: n.lat, endLng: n.lng, color: n.color,
      })),
    ];
    const chain = [
      { node: '나', type: '정보주체', desc: '카카오T 등 이용 시 제공한 이름·전화번호·차량정보 등' },
      { node: '카카오모빌리티', type: '1차 수집', desc: `제3자 제공 ${kakaomobilityRaw.thirdPartyProvision.length}건 공시 (배차·결제·안심번호 등 서비스 운영)` },
      { node: consignmentNode.name, type: '위탁', desc: '고객센터 운영, 인프라, SMS발송, 결제대행 등 (data/services/kakaomobility.json 참고)' },
      ...kakaomobilityRaw.overseasTransfer.map((t: any) => ({
        node: `${t.recipient} (${t.country})`, type: '국외이전', desc: `${t.purposeAndItems} · ${t.retentionPeriod}`,
      })),
    ];

    return {
      id: 'kakaomobility', name: 'kakaomobility.com', korName: '카카오모빌리티', logo: 'K', color: '#000000',
      date: '2020.06.11 공시', lastUse: '원문 참고 (policyUrl)', retention: '표별로 상이 (상세 참고)', risk: '높음',
      nodes, arcs, chain,
    };
  }, [kakaomobilityRaw]);

  // 실제 처리방침 표(data/services/temu.json)에서 뽑은 테무 서비스 노드
  // Temu는 위탁/국외이전을 하나의 표로 통합 공시하므로, 국가별로 집계해서 표시한다
  // (봇 탐지 때문에 자동 파싱이 아니라 수기로 옮긴 미검증 초안 - service.verificationStatus 참고)
  const temuService = useMemo(() => {
    if (!temuRaw) return null;

    const meNode = { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' };
    const collectorNode = { id: 'temu-hq', name: 'Temu', lat: 36.0, lng: 130.0, altitude: 0.2, logo: 'T', color: '#FF6600' };

    const allRecipients = temuRaw.consignmentAndOverseasTransfer.flatMap((c: any) =>
      c.recipients.map((r: any) => ({ ...r, category: c.category }))
    );

    const domesticCount = allRecipients.filter((r: any) => r.country === '한국').length;
    const domesticNode = {
      id: 'temu-domestic', name: `국내 수신처 ${domesticCount}곳`,
      lat: 33.0, lng: 132.5, altitude: 0.35, logo: '🏢', color: '#64748b',
    };

    // 국가별 집계 (한 업체가 여러 국가에 걸치면 - 예: TikTok "미국, 싱가포르, 말레이시아, 아일랜드" - 각 국가에 한 번씩 집계)
    const overseasCounts = new Map<string, number>();
    for (const r of allRecipients) {
      const countryList: string[] = r.country.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '한국');
      for (const country of countryList) {
        overseasCounts.set(country, (overseasCounts.get(country) || 0) + 1);
      }
    }

    const overseasPalette = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899', '#eab308', '#3b82f6'];
    const overseasNodes = Array.from(overseasCounts.entries()).map(([country, count], idx) => {
      const base = COUNTRY_COORDS[country] || { lat: 0, lng: 0 };
      return {
        id: `temu-overseas-${idx}`, name: `${country} (${count}건)`,
        lat: base.lat, lng: base.lng, altitude: 0.4 + idx * 0.03,
        logo: '🌐', color: overseasPalette[idx % overseasPalette.length],
      };
    });

    const nodes = [meNode, collectorNode, domesticNode, ...overseasNodes];
    const arcs = [
      { startLat: meNode.lat, startLng: meNode.lng, endLat: collectorNode.lat, endLng: collectorNode.lng, color: '#FF6600' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: domesticNode.lat, endLng: domesticNode.lng, color: '#64748b' },
      ...overseasNodes.map((n: any) => ({
        startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: n.lat, endLng: n.lng, color: n.color,
      })),
    ];

    const chain = [
      { node: '나', type: '정보주체', desc: '계정정보·주문정보·결제정보·배송주소·개인통관고유부호 등' },
      { node: 'Temu', type: '1차 수집', desc: `위탁·국외이전 ${temuRaw.consignmentAndOverseasTransfer.length}개 구분 공시 (data/services/temu.json 참고)` },
      ...temuRaw.consignmentAndOverseasTransfer.map((c: any) => ({
        node: `${c.category} (${c.recipients.length}곳)`,
        type: c.recipients.some((r: any) => r.country !== '한국') ? '위탁·국외이전' : '위탁',
        desc: `${c.items} · ${c.purpose}`,
      })),
    ];

    return {
      id: 'temu', name: 'temu.com', korName: '테무 (Temu)', logo: 'T', color: '#FF6600',
      date: `${temuRaw.service.retrievedAt} 수기 확인`, lastUse: '원문 참고 (policyUrl)', retention: '미검증 초안 (상세 참고)', risk: '높음',
      nodes, arcs, chain,
    };
  }, [temuRaw]);

  // 실제 처리방침 데이터(data/services/naver.json)에서 뽑은 네이버 서비스 노드
  // 위탁 45건 · 제3자제공 92건은 국내 개별 주소가 없어 집계 노드로, 국외이전 8건 중
  // 실제 국가명이 있는 6건만 국가별로 묶어 지구본에 표시한다. 나머지 2건("네이버 로그인"/
  // "네이버 인증서")은 원문에 "제휴사별로 상이함"이라고만 나와 있어 특정 국가로 지어내지
  // 않고 목록(chain)에만 텍스트로 남긴다.
  const naverService = useMemo(() => {
    if (!naverRaw) return null;

    const meNode = { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' };
    const collectorNode = { id: 'naver-hq', name: '네이버', lat: 37.6, lng: 127.8, altitude: 0.2, logo: 'N', color: '#03C75A' };
    const consignmentNode = {
      id: 'naver-consignment', name: `국내 위탁 ${naverRaw.consignment.length}곳`,
      lat: 35.0, lng: 130.5, altitude: 0.3, logo: '🏢', color: '#64748b',
    };
    const thirdPartyNode = {
      id: 'naver-third-party', name: `국내 제3자 제공 ${naverRaw.thirdPartyProvision.length}건`,
      lat: 33.5, lng: 131.5, altitude: 0.35, logo: '🤝', color: '#94a3b8',
    };

    const geoOverseas = naverRaw.overseasTransfer.filter((t: any) => COUNTRY_COORDS[t.country]);
    const variableOverseas = naverRaw.overseasTransfer.filter((t: any) => !COUNTRY_COORDS[t.country]);

    const overseasCounts = new Map<string, number>();
    for (const t of geoOverseas) {
      overseasCounts.set(t.country, (overseasCounts.get(t.country) || 0) + 1);
    }
    const overseasPalette = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];
    const overseasNodes = Array.from(overseasCounts.entries()).map(([country, count], idx) => {
      const base = COUNTRY_COORDS[country];
      return {
        id: `naver-overseas-${idx}`, name: `${country} (${count}건)`,
        lat: base.lat, lng: base.lng, altitude: 0.4 + idx * 0.05,
        logo: '🌐', color: overseasPalette[idx % overseasPalette.length],
      };
    });

    const nodes = [meNode, collectorNode, consignmentNode, thirdPartyNode, ...overseasNodes];
    const arcs = [
      { startLat: meNode.lat, startLng: meNode.lng, endLat: collectorNode.lat, endLng: collectorNode.lng, color: '#03C75A' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: consignmentNode.lat, endLng: consignmentNode.lng, color: '#64748b' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: thirdPartyNode.lat, endLng: thirdPartyNode.lng, color: '#94a3b8' },
      ...overseasNodes.map((n: any) => ({
        startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: n.lat, endLng: n.lng, color: n.color,
      })),
    ];

    const chain = [
      { node: '나', type: '정보주체', desc: '회원가입·서비스 이용 시 제공한 아이디·이름·연락처 등' },
      { node: '네이버', type: '1차 수집', desc: `위탁 ${naverRaw.consignment.length}건 · 제3자 제공 ${naverRaw.thirdPartyProvision.length}건 공개 API로 확인 (data/services/naver.json 참고)` },
      { node: consignmentNode.name, type: '위탁', desc: '시스템 개발/운영, 인프라, 고객상담 등 (기본 5 + 서비스별 40)' },
      { node: thirdPartyNode.name, type: '제3자 제공', desc: '검역정보 연동, 금융 제휴, 서비스별 파트너 제공 등 92건' },
      ...geoOverseas.map((t: any) => ({
        node: `${t.recipient} (${t.country})`, type: '국외이전', desc: `${t.purposeAndItems} · ${t.retentionPeriod}`,
      })),
      ...variableOverseas.map((t: any) => ({
        node: `${t.recipient} (제휴사별 상이)`, type: '국외이전', desc: `${t.purposeAndItems} · ${t.retentionPeriod}`,
      })),
    ];

    return {
      id: 'naver', name: 'naver.com', korName: '네이버 (NAVER)', logo: 'N', color: '#03C75A',
      date: '공개 API 자동 수집', lastUse: '원문 참고 (policyUrl)', retention: '항목별로 상이 (상세 참고)', risk: '높음',
      nodes, arcs, chain,
    };
  }, [naverRaw]);

  // 실제 처리방침 표(data/services/coupang.json)에서 뽑은 쿠팡 서비스 노드
  // 국외이전 12건(위탁 11 + 제3자 제공 1)은 국가별로 집계해 노드로 띄우고,
  // 상세 체인에는 건별 수신처를 그대로 나열한다. 국가가 특정되지 않은 행
  // (원문이 '업체 리스트 참조'로만 공시)은 좌표를 만들지 않고 체인에만 표시한다.
  const coupangService = useMemo(() => {
    if (!coupangRaw) return null;

    const meNode = { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' };
    const collectorNode = { id: 'coupang-hq', name: '쿠팡', lat: 36.8, lng: 125.0, altitude: 0.2, logo: 'C', color: '#E52528' };
    const consignmentNode = {
      id: 'coupang-consignment', name: `국내 수탁사 ${coupangRaw.consignment.length}개 업무`,
      lat: 33.5, lng: 124.0, altitude: 0.35, logo: '🏢', color: '#64748b'
    };

    const overseasCounts = new Map<string, number>();
    for (const t of coupangRaw.overseasTransfer) {
      if (!COUNTRY_COORDS[t.country]) continue;
      overseasCounts.set(t.country, (overseasCounts.get(t.country) || 0) + 1);
    }
    const overseasPalette = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899'];
    const overseasNodes = Array.from(overseasCounts.entries()).map(([country, count], idx) => {
      const base = COUNTRY_COORDS[country];
      return {
        id: `coupang-overseas-${idx}`, name: `${country} (${count}건)`,
        lat: base.lat, lng: base.lng, altitude: 0.4 + idx * 0.03,
        logo: '🌐', color: overseasPalette[idx % overseasPalette.length],
      };
    });

    const nodes = [meNode, collectorNode, consignmentNode, ...overseasNodes];
    const arcs = [
      { startLat: meNode.lat, startLng: meNode.lng, endLat: collectorNode.lat, endLng: collectorNode.lng, color: '#E52528' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: consignmentNode.lat, endLng: consignmentNode.lng, color: '#64748b' },
      ...overseasNodes.map((n: any) => ({
        startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: n.lat, endLng: n.lng, color: n.color,
      })),
    ];

    const chain = [
      { node: '나', type: '정보주체', desc: '주문·결제·배송지·개인통관고유부호 등' },
      { node: '쿠팡', type: '1차 수집', desc: `제3자 제공 ${coupangRaw.thirdPartyProvision.length}건 공시 (관세청·국세청 등 법령 근거 제공 포함)` },
      { node: consignmentNode.name, type: '위탁', desc: '고객상담, 본인확인, 배송, 결제 등 (data/services/coupang.json 참고)' },
      ...coupangRaw.overseasTransfer.map((t: any) => ({
        node: `${t.recipient} (${t.country})`,
        type: t.transferType === '제3자 제공' ? '국외 제3자 제공' : '국외이전',
        desc: `${t.purposeAndItems} · ${t.retentionPeriod}`,
      })),
    ];

    return {
      id: 'coupang', name: 'coupang.com', korName: '쿠팡', logo: 'C', color: '#E52528',
      date: `${coupangRaw.service.retrievedAt} 수집`, lastUse: '원문 참고 (policyUrl)', retention: '표별로 상이 (상세 참고)', risk: '높음',
      nodes, arcs, chain,
    };
  }, [coupangRaw]);

  // 실제 처리방침 표(data/services/netflix.json)에서 뽑은 넷플릭스 서비스 노드
  // 한 수탁사가 여러 국가로 이전하는 경우가 많아(예: Google reCaptcha 9개국),
  // 국가별로 몇 개 수신처가 그 나라를 거치는지 집계해서 노드로 띄운다.
  const netflixService = useMemo(() => {
    if (!netflixRaw) return null;

    const meNode = { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' };
    const collectorNode = { id: 'netflix-hq', name: '넷플릭스', lat: 36.2, lng: 122.5, altitude: 0.2, logo: 'N', color: '#E50914' };
    const consignmentNode = {
      id: 'netflix-consignment', name: `국내 수탁사 ${netflixRaw.consignment.length}곳`,
      lat: 32.5, lng: 120.0, altitude: 0.35, logo: '🏢', color: '#64748b'
    };

    const overseasCounts = new Map<string, number>();
    for (const t of netflixRaw.overseasTransfer) {
      for (const raw of t.countries) {
        const country = normalizeCountry(raw);
        if (!COUNTRY_COORDS[country]) continue;
        overseasCounts.set(country, (overseasCounts.get(country) || 0) + 1);
      }
    }

    const overseasPalette = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899'];
    const overseasNodes = Array.from(overseasCounts.entries()).map(([country, count], idx) => {
      const base = COUNTRY_COORDS[country];
      return {
        id: `netflix-overseas-${idx}`, name: `${country} (${count}건)`,
        lat: base.lat, lng: base.lng, altitude: 0.4,
        logo: '🌐', color: overseasPalette[idx % overseasPalette.length],
      };
    });

    const nodes = [meNode, collectorNode, consignmentNode, ...overseasNodes];
    const arcs = [
      { startLat: meNode.lat, startLng: meNode.lng, endLat: collectorNode.lat, endLng: collectorNode.lng, color: '#E50914' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: consignmentNode.lat, endLng: consignmentNode.lng, color: '#64748b' },
      ...overseasNodes.map((n: any) => ({
        startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: n.lat, endLng: n.lng, color: n.color,
      })),
    ];

    const chain = [
      { node: '나', type: '정보주체', desc: '계정·시청기록·결제정보·디바이스 정보 등' },
      { node: '넷플릭스', type: '1차 수집', desc: `국외이전 ${netflixRaw.overseasTransfer.length}건 · ${overseasCounts.size}개국 공시` },
      { node: consignmentNode.name, type: '위탁', desc: netflixRaw.consignment.map((c: any) => `${c.consignee}(${c.task})`).join(', ') },
      ...netflixRaw.overseasTransfer.map((t: any) => ({
        node: `${t.recipient} (${t.countries.length}개국)`,
        type: t.transferType === '제3자 제공' ? '국외 제3자 제공' : '국외이전',
        desc: `${t.purposeAndItems} · ${t.countries.map(normalizeCountry).join(', ')}`,
      })),
    ];

    return {
      id: 'netflix', name: 'netflix.com', korName: '넷플릭스', logo: 'N', color: '#E50914',
      date: `${netflixRaw.service.retrievedAt} 수집`, lastUse: '원문 참고 (policyUrl)', retention: '목적 달성에 필요한 기간', risk: '높음',
      nodes, arcs, chain,
    };
  }, [netflixRaw]);

  // 실제 부록 문서(data/services/google.json)에서 뽑은 구글 서비스 노드
  // 구글은 국가를 공시한 국외 수탁사(5곳)와, 국가를 밝히지 않은 자사 데이터센터 이전이
  // 함께 있다. 후자는 좌표를 만들 수 없으므로 지구본에는 띄우지 않고 체인에만 남긴다.
  const googleService = useMemo(() => {
    if (!googleRaw) return null;

    const meNode = { id: 'me', name: '나', lat: 37.5, lng: 127.0, altitude: 0.05, logo: '👤', color: '#3b82f6' };
    const collectorNode = { id: 'google-hq', name: '구글', lat: 38.5, lng: 121.0, altitude: 0.2, logo: 'G', color: '#4285F4' };
    const domesticCount = googleRaw.consignment.filter((c: any) => c.countries.length === 0).length;
    const consignmentNode = {
      id: 'google-consignment', name: `국가 미표기 위탁사 ${domesticCount}곳`,
      lat: 34.0, lng: 118.5, altitude: 0.35, logo: '🏢', color: '#64748b'
    };

    const overseasCounts = new Map<string, number>();
    for (const t of googleRaw.overseasTransfer) {
      for (const raw of t.countries) {
        const country = normalizeCountry(raw);
        if (!COUNTRY_COORDS[country]) continue;
        overseasCounts.set(country, (overseasCounts.get(country) || 0) + 1);
      }
    }

    const overseasPalette = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899'];
    const overseasNodes = Array.from(overseasCounts.entries()).map(([country, count], idx) => {
      const base = COUNTRY_COORDS[country];
      return {
        id: `google-overseas-${idx}`, name: `${country} (${count}건)`,
        lat: base.lat, lng: base.lng, altitude: 0.4,
        logo: '🌐', color: overseasPalette[idx % overseasPalette.length],
      };
    });

    const nodes = [meNode, collectorNode, consignmentNode, ...overseasNodes];
    const arcs = [
      { startLat: meNode.lat, startLng: meNode.lng, endLat: collectorNode.lat, endLng: collectorNode.lng, color: '#4285F4' },
      { startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: consignmentNode.lat, endLng: consignmentNode.lng, color: '#64748b' },
      ...overseasNodes.map((n: any) => ({
        startLat: collectorNode.lat, startLng: collectorNode.lng, endLat: n.lat, endLng: n.lng, color: n.color,
      })),
    ];

    const chain = [
      { node: '나', type: '정보주체', desc: '계정정보·검색어·기기정보·위치정보·통화기록 등' },
      { node: '구글', type: '1차 수집', desc: `위탁 ${googleRaw.consignment.length}곳 · 제3자 제공 ${googleRaw.thirdPartyProvision.length}건 공시` },
      { node: consignmentNode.name, type: '위탁', desc: '원문이 소재 국가를 적지 않아 국내·국외 판별 불가 (service.disclosureGaps 참고)' },
      ...googleRaw.overseasTransfer.map((t: any) => ({
        node: t.countries.length ? `${t.recipient} (${t.countries.map(normalizeCountry).join(', ')})` : t.recipient,
        type: t.transferType === '자사 데이터센터 이전' ? '국외이전 (국가 미공시)' : '국외이전',
        desc: t.purposeAndItems,
      })),
      ...googleRaw.thirdPartyProvision.map((t: any) => ({
        node: t.recipient, type: '제3자 제공', desc: `${t.purpose} / ${t.items}`,
      })),
    ];

    return {
      id: 'google', name: 'google.com', korName: '구글', logo: 'G', color: '#4285F4',
      date: `${googleRaw.service.retrievedAt} 수집`, lastUse: '원문 참고 (policyUrl)', retention: '사용자 삭제 시까지 (법정 의무 시 5년 이상)', risk: '높음',
      nodes, arcs, chain,
    };
  }, [googleRaw]);

  const networkServices = [kakaomobilityService, temuService, naverService, coupangService, netflixService, googleService].filter(Boolean);

  // 메인 화면에 띄울 기본 아이콘들 ('나'를 중심으로 개인정보가 각 서비스로 흘러나가는 모습)
  const activeElements = selectedService ? selectedService.nodes : [
    { id: 'me', name: '나', lat: 36.5, lng: 127.5, altitude: 0.05, logo: '👤', color: '#3b82f6' },
    { id: 'naver', name: '네이버', lat: 37.5, lng: 129.0, altitude: 0.2, logo: 'N', color: '#03C75A' },
    { id: 'insta', name: '인스타그램', lat: 25.0, lng: 110.0, altitude: 0.3, logo: '📷', color: '#E1306C' },
    { id: 'temu', name: '테무', lat: 45.0, lng: 140.0, altitude: 0.25, logo: '🛒', color: '#FF6600' },
    { id: 'cloud', name: '클라우드', lat: 15.0, lng: 135.0, altitude: 0.35, logo: '☁️', color: '#0284c7' },
    { id: 'kakaomobility', name: '카카오모빌리티', lat: 33.5, lng: 128.5, altitude: 0.4, logo: 'K', color: '#000000' },
    { id: 'coupang', name: '쿠팡', lat: 30.0, lng: 122.0, altitude: 0.3, logo: 'C', color: '#E52528' },
    { id: 'netflix', name: '넷플릭스', lat: 41.0, lng: 118.0, altitude: 0.35, logo: 'N', color: '#E50914' },
    { id: 'google', name: '구글', lat: 22.0, lng: 124.0, altitude: 0.3, logo: 'G', color: '#4285F4' }
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
        arcColor={() => ARC_GRADIENT}
        arcDashLength={0.3}
        arcDashGap={0.35}
        arcDashAnimateTime={1500}
        arcStroke={1.2}
        arcAltitude={arcAltitudeByDistance}
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