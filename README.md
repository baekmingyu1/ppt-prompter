# concert-prompter

실시간 가사 프롬프터 프로젝트입니다. 조작 화면에서 곡과 현재 줄을 제어하면 관객 화면과 가수 화면에 Socket.IO로 동기화됩니다.

## 실행

```powershell
cd concert-prompter
npm install
npm run dev
```

기본 주소:

- 조작 화면: http://localhost:3000
- 관객 화면: http://localhost:3001
- 가수 화면: http://localhost:3002
- 통합 서버: http://localhost:4000

## 검증

```powershell
cd concert-prompter
npm run check
```

## 중지

```powershell
cd concert-prompter
npm run stop
```
