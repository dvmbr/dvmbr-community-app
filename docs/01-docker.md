# Docker Local Deployment

## 목적

이 문서는 로컬과 EC2 배포를 같은 구조로 맞추기 위한 Docker Compose 구성 내용을 정리합니다.

현재 Docker 구성은 다음 세 컨테이너로 이루어져 있습니다.

- `web`: Next.js production server
- `api`: NestJS production server
- `nginx`: reverse proxy

## 요청 흐름

```txt
Browser
  ↓
nginx:80
  ├─ /      → web:3000
  └─ /api  → api:3001
```

외부에서는 nginx의 80번 포트만 사용합니다.

`web`과 `api`의 포트는 Docker network 안에서만 노출됩니다.

## 파일 구성

```txt
docker-compose.yml
.dockerignore
nginx/default.conf
apps/web/Dockerfile
apps/api/Dockerfile
```

## 컨테이너 역할

### web

`apps/web/Dockerfile`은 Next.js 앱을 production 모드로 빌드하고 실행합니다.

빌드 단계:

```bash
pnpm --filter web build
```

실행 단계:

```bash
pnpm --filter web start
```

`web` 컨테이너 내부에서는 Next.js가 3000번 포트로 실행됩니다.

### api

`apps/api/Dockerfile`은 NestJS 앱을 production 모드로 빌드하고 실행합니다.

빌드 단계:

```bash
pnpm --filter api build
```

실행 단계:

```bash
pnpm --filter api start:prod
```

`api` 컨테이너 내부에서는 NestJS가 3001번 포트로 실행됩니다.

### nginx

`nginx`는 외부 요청을 받아 내부 컨테이너로 전달합니다.

현재 설정은 다음과 같습니다.

- `/` → `web:3000`
- `/api` → `api:3001`
- `/api/*` → `api:3001`

`nginx/default.conf`는 Docker Compose volume으로 nginx 컨테이너의 설정 파일 위치에 연결됩니다.

```yaml
volumes:
  - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
```

`ro`는 read-only를 의미합니다.

## 실행 방법

프로젝트 루트에서 실행합니다.

```bash
docker compose up --build
```

백그라운드에서 실행하려면 다음 명령을 사용합니다.

```bash
docker compose up -d --build
```

중지하려면 다음 명령을 사용합니다.

```bash
docker compose down
```

## 확인 방법

브라우저 또는 curl로 확인합니다.

```bash
curl http://localhost
curl http://localhost/api
```

예상 결과:

- `http://localhost`: Next.js web 화면
- `http://localhost/api`: NestJS `Hello World!` 응답

## 포트 충돌

로컬에서 80번 포트가 이미 사용 중이면 `docker-compose.yml`의 nginx 포트 매핑을 변경합니다.

```yaml
ports:
  - "8080:80"
```

이 경우 확인 주소는 다음과 같습니다.

```txt
http://localhost:8080
http://localhost:8080/api
```

## 라우팅 주의사항

현재 nginx 설정은 `/api` prefix를 제거하고 NestJS로 전달합니다.

예:

```txt
외부 요청: /api/users
NestJS 라우트: /users
```

따라서 현재 구조에서는 NestJS에 `app.setGlobalPrefix("api")`를 추가하지 않습니다.

나중에 NestJS 내부 라우트도 `/api/users` 형태로 운영하려면 nginx proxy 설정을 함께 변경해야 합니다.
