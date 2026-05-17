# GitHub Actions Deployment

## 목적

이 문서는 GitHub Actions를 사용해 `main` branch 변경 사항을 EC2에 자동 배포하는 구성을 정리합니다.

현재 자동 배포는 GitHub Actions에서 Docker image를 빌드하고 GitHub Container Registry에 push한 뒤, EC2에서 image를 pull해서 Docker Compose로 다시 실행하는 방식입니다.

## 전체 흐름

```txt
main branch push
  ↓
GitHub Actions
  ↓
web Docker image build
  ↓
api Docker image build
  ↓
GHCR push
  ↓
EC2 SSH 접속
  ↓
git fetch origin main
  ↓
git reset --hard origin/main
  ↓
docker compose -f docker-compose.prod.yml pull
  ↓
docker compose -f docker-compose.prod.yml up -d
```

## 관련 파일

```txt
.github/workflows/deploy-ec2.yml
docker-compose.prod.yml
apps/web/Dockerfile
apps/api/Dockerfile
nginx/default.conf
```

## Workflow

워크플로우 파일은 다음 위치에 있습니다.

```txt
.github/workflows/deploy-ec2.yml
```

실행 조건:

- `main` branch에 push
- GitHub Actions 화면에서 `workflow_dispatch`로 수동 실행

권한:

```yaml
permissions:
  contents: read
  packages: write
```

`contents: read`는 repository checkout에 사용합니다.

`packages: write`는 GHCR에 Docker image를 push하기 위해 사용합니다.

## Docker image

현재 workflow는 두 개의 image를 빌드하고 GHCR에 push합니다.

```txt
ghcr.io/dvmbr/dvmbr-community-app-web
ghcr.io/dvmbr/dvmbr-community-app-api
```

각 image에는 두 가지 tag를 붙입니다.

```txt
latest
<github commit sha>
```

예:

```txt
ghcr.io/dvmbr/dvmbr-community-app-web:latest
ghcr.io/dvmbr/dvmbr-community-app-web:<github-sha>
```

`latest`는 EC2의 `docker-compose.prod.yml`에서 pull하는 tag입니다.

commit sha tag는 나중에 특정 배포 버전을 추적하거나 롤백할 때 사용할 수 있습니다.

## Production Compose

EC2 자동 배포에서는 `docker-compose.prod.yml`을 사용합니다.

로컬 검증용 `docker-compose.yml`은 image를 직접 build합니다.

```yaml
web:
  build:
    context: .
    dockerfile: apps/web/Dockerfile
```

반면 production compose는 GHCR image를 pull합니다.

```yaml
web:
  image: ghcr.io/dvmbr/dvmbr-community-app-web:latest
```

이렇게 분리한 이유는 EC2에서 Docker build를 하지 않기 위해서입니다.

현재 EC2 인스턴스는 `t3.micro`이고 메모리가 1GB라서, 서버에서 직접 build하면 메모리 부족이 날 수 있습니다. GitHub Actions에서 build를 끝내고 EC2는 pull만 하게 하는 편이 더 안정적입니다.

## GitHub repository secrets

GitHub repository의 `Settings → Secrets and variables → Actions`에 다음 secrets를 등록합니다.

```txt
EC2_HOST
EC2_USER
EC2_SSH_PRIVATE_KEY
```

현재 값 예시:

```txt
EC2_HOST=54.180.109.3
EC2_USER=ubuntu
```

`EC2_SSH_PRIVATE_KEY`에는 로컬 EC2 접속용 private key 내용을 등록합니다.

로컬에서 다음 명령으로 내용을 확인할 수 있습니다.

```bash
cat ~/.ssh/dvmbr-ec2-key.pem
```

등록할 때는 다음 줄을 포함합니다.

```txt
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
```

주의:

- private key 내용은 repository에 커밋하지 않습니다.
- private key 내용은 문서에 붙여넣지 않습니다.
- GitHub Actions secret에만 등록합니다.
- 터미널에 마지막 `%`가 보이면 키 내용이 아니라 shell 표시일 수 있으므로 포함하지 않습니다.

## GHCR visibility

EC2에서 GHCR image를 pull하려면 image 접근 권한이 필요합니다.

초기 배포에서는 GHCR package visibility를 `Public`으로 두는 것이 가장 단순합니다.

Public으로 설정하면 EC2에서 별도 `docker login ghcr.io` 없이 image를 pull할 수 있습니다.

Private으로 유지하려면 EC2에서 GHCR login이 필요합니다.

```bash
echo "<GITHUB_PAT>" | docker login ghcr.io -u "<GITHUB_USERNAME>" --password-stdin
```

private image pull용 GitHub token에는 일반적으로 `read:packages` 권한이 필요합니다.

## EC2 사전 조건

자동 배포가 동작하려면 EC2에 다음이 준비되어 있어야 합니다.

- Docker 설치 완료
- Docker Compose plugin 설치 완료
- `/home/ubuntu/dvmbr-community-app` 경로에 repository clone 완료
- EC2에서 `git fetch origin main` 실행 가능
- EC2에서 GHCR image pull 가능
- EC2에서 `docker compose -f docker-compose.prod.yml up -d` 실행 가능

repository가 private이면 EC2에서 GitHub repository를 pull할 수 있도록 deploy key 또는 personal access token 설정이 필요합니다.

## EC2에서 사용하는 명령

workflow의 EC2 배포 단계는 다음 명령을 실행합니다.

```bash
cd /home/ubuntu/dvmbr-community-app
git fetch origin main
git reset --hard origin/main

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```

`git reset --hard origin/main`은 EC2 작업 디렉터리를 GitHub의 최신 `main`과 정확히 맞춥니다.

따라서 EC2 안에서 직접 수정한 파일은 다음 배포 때 사라질 수 있습니다. 서버 전용 설정은 repository에 커밋하거나 `.env`처럼 별도 파일로 관리해야 합니다.

## 수동 실행

GitHub에서 수동으로 배포를 실행할 수 있습니다.

1. repository의 `Actions` 탭으로 이동
2. `Deploy to EC2` workflow 선택
3. `Run workflow` 클릭
4. branch를 `main`으로 선택
5. 실행

## 배포 확인

Actions가 성공한 뒤 EC2 public IP로 확인합니다.

```txt
http://54.180.109.3
http://54.180.109.3/api
```

EC2에서 직접 확인할 수도 있습니다.

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## 문제 해결

### SSH 접속 실패

GitHub Actions 로그에서 SSH timeout이 발생하면 다음을 확인합니다.

- EC2 instance가 running 상태인지
- EC2 public IP가 `EC2_HOST` secret과 같은지
- Security Group에서 SSH 22가 GitHub Actions runner에서 접근 가능한지

현재 Security Group의 SSH rule이 `My IP`만 허용이면 GitHub Actions runner는 접속할 수 없습니다.

자동 배포를 사용하려면 SSH 접근 방식을 다시 설계해야 합니다.

선택지:

- 임시로 SSH 22를 더 넓게 허용
- self-hosted runner를 EC2에 설치
- AWS Systems Manager Session Manager 사용

초기 학습 단계에서는 GitHub Actions SSH 접속을 위해 보안 그룹 정책을 별도로 조정해야 할 수 있습니다.

### GHCR pull 실패

`docker compose pull`에서 permission denied가 발생하면 GHCR image visibility를 확인합니다.

- Public image: 별도 login 없이 pull 가능
- Private image: EC2에서 `docker login ghcr.io` 필요

### Docker compose 파일 없음

EC2에서 `docker-compose.prod.yml`을 찾지 못하면 EC2 repository가 최신 main인지 확인합니다.

```bash
cd /home/ubuntu/dvmbr-community-app
git fetch origin main
git reset --hard origin/main
ls docker-compose.prod.yml
```
