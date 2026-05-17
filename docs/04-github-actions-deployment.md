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
build job on GitHub-hosted runner
  ↓
web Docker image build
  ↓
api Docker image build
  ↓
GHCR push
  ↓
deploy job on EC2 self-hosted runner
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

현재 workflow는 두 job으로 나뉩니다.

```txt
build  → GitHub-hosted runner에서 실행
deploy → EC2 self-hosted runner에서 실행
```

`build` job:

```yaml
runs-on: ubuntu-latest
```

`deploy` job:

```yaml
needs: build
runs-on: self-hosted
```

`deploy` job은 EC2에 설치된 self-hosted runner가 가져가서 실행합니다. 따라서 GitHub-hosted runner가 EC2에 SSH로 접속하지 않습니다.

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

현재 self-hosted runner 방식에서는 EC2 SSH 접속용 secrets가 필요하지 않습니다.

이전 SSH 방식에서는 다음 secrets를 사용했습니다.

```txt
EC2_HOST
EC2_USER
EC2_SSH_PRIVATE_KEY
```

하지만 현재 workflow는 `deploy` job을 EC2 self-hosted runner에서 직접 실행하므로, GitHub-hosted runner가 EC2에 SSH 접속하지 않습니다.

따라서 위 SSH secrets는 현재 방식에서는 사용하지 않습니다.

주의: EC2 key pair private key 내용은 repository, 문서, 코드에 넣지 않습니다.

주의: GitHub runner 등록 token도 문서에 남기지 않습니다. runner 등록 화면의 token은 짧은 시간만 유효하지만, 화면 밖으로 공유하지 않는 습관을 유지합니다.

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
- GitHub self-hosted runner 설치 완료
- self-hosted runner service가 `active (running)` 상태

repository가 private이면 EC2에서 GitHub repository를 pull할 수 있도록 deploy key 또는 personal access token 설정이 필요합니다.

## Self-hosted runner

GitHub repository에서 self-hosted runner를 추가합니다.

경로:

```txt
Repository → Settings → Actions → Runners → New self-hosted runner
```

선택:

```txt
Linux
x64
```

GitHub 화면에 표시되는 실제 명령을 EC2에서 실행합니다.

주의: 문서나 예시의 `...`를 그대로 실행하지 않습니다. GitHub 화면에 나온 실제 runner version, download URL, token을 그대로 사용합니다.

### Runner 설치 명령

아래 명령은 EC2에 SSH 접속한 상태에서 실행합니다.

프롬프트가 다음과 비슷하면 EC2 안에 접속한 상태입니다.

```txt
ubuntu@ip-172-31-42-250:~$
```

runner는 repository 밖에 설치합니다.

추천 경로:

```txt
/home/ubuntu/actions-runner
```

설치 흐름은 다음과 같습니다.

```bash
cd ~
mkdir actions-runner
cd actions-runner

curl -o actions-runner-linux-x64-<version>.tar.gz -L <github-runner-download-url>
tar xzf ./actions-runner-linux-x64-<version>.tar.gz

./config.sh --url https://github.com/dvmbr/dvmbr-community-app --token <runner-registration-token>
```

주의:

- `<version>`에는 GitHub 화면에 나온 runner 버전이 들어갑니다.
- `<github-runner-download-url>`에는 GitHub 화면에 나온 실제 다운로드 URL이 들어갑니다.
- `<runner-registration-token>`에는 GitHub 화면에 나온 실제 token이 들어갑니다.
- `<...>` 전체를 그대로 입력하는 것이 아니라, GitHub 화면에서 제공한 실제 값으로 바꿔서 실행합니다.
- runner registration token은 문서에 저장하지 않습니다.

`./config.sh` 실행 중에는 몇 가지 질문이 나옵니다.

대부분 기본값으로 진행해도 됩니다.

```txt
Enter the name of the runner group to add this runner to: [press Enter for Default]
Enter the name of runner: [press Enter for default hostname]
Enter any additional labels: [press Enter for default]
Enter name of work folder: [press Enter for _work]
```

repository 안에 잘못 만들었다면 삭제합니다.

```bash
cd /home/ubuntu/dvmbr-community-app
rm -rf actions-runner
```

runner 설정 후 테스트 실행:

```bash
cd ~/actions-runner
./run.sh
```

`Listening for Jobs`가 보이면 GitHub Actions job을 받을 수 있는 상태입니다.

터미널을 닫아도 runner가 계속 실행되게 하려면 service로 등록합니다.

```bash
cd ~/actions-runner
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

정상 상태 예시:

```txt
Loaded: loaded (...; enabled; ...)
Active: active (running)
√ Connected to GitHub
Listening for Jobs
```

`enabled`는 서버 재시작 후에도 service가 자동으로 시작되도록 등록되었다는 의미입니다.

`active (running)`은 runner가 현재 백그라운드에서 실행 중이라는 의미입니다.

현재 EC2에서는 다음 service가 등록되어 실행 중인 것을 확인했습니다.

```txt
actions.runner.dvmbr-dvmbr-community-app.ip-172-31-42-250.service
```

## EC2에서 사용하는 명령

workflow의 `deploy` job은 EC2 self-hosted runner에서 다음 명령을 실행합니다.

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

### Hosted runner SSH timeout

초기에는 GitHub-hosted runner에서 EC2로 SSH 접속하는 방식을 시도했습니다.

이때 다음 오류가 발생했습니다.

```txt
ssh: connect to host <EC2_HOST> port 22: Connection timed out
```

원인:

- EC2 Security Group의 SSH 22 inbound rule이 `My IP`만 허용
- GitHub-hosted runner는 내 Mac의 IP가 아니므로 EC2 22번 포트에 접근 불가

이 오류는 key 문제가 아닙니다.

key가 틀린 경우에는 보통 다음과 같은 오류가 납니다.

```txt
Permission denied (publickey)
```

해결:

- SSH 방식 대신 EC2 self-hosted runner 방식으로 변경
- `deploy` job을 `runs-on: self-hosted`로 실행
- EC2 보안그룹의 SSH 22는 계속 `My IP`로 제한

### Waiting for a runner

다음 상태에서 job이 오래 대기할 수 있습니다.

```txt
Waiting for a runner to pick up this job...
Requested labels: self-hosted
```

원인:

- repository에 online 상태인 self-hosted runner가 없음
- EC2 runner service가 꺼져 있음
- runner가 다른 repository에 등록되어 있음

확인:

```txt
Repository → Settings → Actions → Runners
```

EC2에서 상태 확인:

```bash
cd ~/actions-runner
sudo ./svc.sh status
```

정상 상태:

```txt
Active: active (running)
Listening for Jobs
```

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

### GitHub Actions 비용과 AWS 비용

GitHub-hosted runner에서 Docker image를 build/push하는 비용은 AWS 비용이 아닙니다.

AWS 비용과 관련 있는 것은 다음입니다.

- EC2 instance가 `Running` 상태
- EBS volume
- Public IPv4 사용
- EC2에서 실행되는 self-hosted runner

self-hosted runner가 동작하려면 EC2가 켜져 있어야 하므로, 배포 테스트가 끝났고 비용을 멈추려면 EC2 instance를 `Stop` 합니다.

### Docker 권한 오류

self-hosted runner의 deploy job에서 Docker 명령이 permission denied로 실패하면 runner service를 실행하는 사용자가 Docker를 사용할 수 있는지 확인합니다.

EC2에서 확인:

```bash
groups ubuntu
docker ps
```

`ubuntu`가 `docker` 그룹에 들어간 뒤에도 runner service가 예전 권한으로 떠 있으면 service를 재시작합니다.

```bash
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start
sudo ./svc.sh status
```

### Self-hosted runner는 yml로 켤 수 없음

`runs-on: self-hosted` job은 이미 켜져 있는 runner가 job을 가져가는 구조입니다.

따라서 `deploy-ec2.yml` 안에 runner service를 시작하는 명령을 넣을 수 없습니다. 그 yml을 실행하려면 runner가 먼저 살아 있어야 하기 때문입니다.

runner를 계속 켜두기 위해 `svc.sh install`과 `svc.sh start`로 systemd service에 등록했습니다.
