# EC2 Docker Deployment

## 목적

이 문서는 EC2 Ubuntu 인스턴스에 Docker를 설치하고, repository를 clone한 뒤, Docker Compose로 `web + api + nginx` 서비스를 실행하는 과정을 정리합니다.

이 문서는 `docs/02-ec2-deployment.md`의 EC2 생성과 SSH 접속이 완료된 뒤 진행합니다.

현재 최종 배포 방식은 GitHub Actions에서 Docker image를 빌드하고 EC2에서는 image를 pull하는 방식입니다. 자동 배포 구성은 `docs/04-github-actions-deployment.md`에 정리합니다.

이 문서의 `docker compose up -d --build` 방식은 EC2에서 직접 build까지 수행하는 초기 수동 검증 절차로 남겨둡니다.

## Docker APT 키 등록 방식 (공식 출처)

`apt-key` 방식은 deprecated 되었기 때문에, 최근에는 `/etc/apt/keyrings` 경로에 키를 저장하고 APT source에서 `Signed-By`로 키를 참조하는 방식이 권장됩니다.

공식 문서:

- Ubuntu: [Install Docker Engine on Ubuntu - Install using the apt repository](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository)
- Debian: [Install Docker Engine on Debian - Install using the apt repository](https://docs.docker.com/engine/install/debian/#install-using-the-repository)

## Docker 설치

아래 명령은 EC2 Ubuntu 인스턴스에 SSH 접속한 상태에서 실행합니다.

프롬프트가 다음과 비슷하면 EC2 안에 접속한 상태입니다.

```txt
ubuntu@ip-172-31-42-250:~$
```

### 1. 기본 패키지 설치

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
```

### 2. Docker GPG key 등록

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

### 3. Docker repository 추가

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 4. Docker Engine 설치

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

설명:

- `sudo apt update`: 방금 등록한 Docker APT repository를 포함해 패키지 인덱스를 최신 상태로 갱신합니다.
- `sudo apt install -y ...`: Docker Engine과 실행/빌드/Compose에 필요한 구성 요소를 한 번에 설치합니다.
  - `docker-ce`: Docker Engine
  - `docker-ce-cli`: Docker CLI
  - `containerd.io`: 컨테이너 런타임
  - `docker-buildx-plugin`: Buildx 빌드 기능
  - `docker-compose-plugin`: `docker compose` 명령 지원
  - `-y`: 설치 확인 프롬프트 자동 승인

설치되는 주요 패키지는 위 항목을 참고합니다.

### 5. Docker 서비스 상태 확인

```bash
sudo systemctl status docker
```

`active (running)` 이면 정상입니다.

### 6. sudo 없이 Docker 사용 설정

`ubuntu` 유저가 매번 `sudo` 없이 Docker를 실행할 수 있도록 `docker` 그룹에 추가합니다.

```bash
sudo usermod -aG docker $USER
```

그룹 변경을 적용하려면 SSH를 끊고 다시 접속합니다.

```bash
exit
ssh dvmbr-community-app-ec2
```

### 7. Docker 동작 검증

재접속 후 다음 명령으로 Docker 설치를 확인합니다.

```bash
docker --version
docker compose version
docker run hello-world
```

`Hello from Docker!` 메시지가 나오면 Docker 설치가 완료된 상태입니다.

## Repository 배포

GitHub repository가 준비된 뒤 EC2에서 clone합니다.

```bash
git clone <repo-url>
cd dvmbr-community-app
```

현재 repository가 private이면 EC2에서 GitHub 인증 설정이 필요합니다.

초기 선택지는 다음과 같습니다.

- public repository: HTTPS clone
- private repository: GitHub deploy key 또는 personal access token 사용

## Docker Compose 실행

repository clone 후 프로젝트 루트에서 실행합니다.

```bash
docker compose up -d --build
```

이 명령은 EC2에서 직접 Docker image를 build합니다. 초기 확인에는 단순하지만, `t3.micro`처럼 메모리가 작은 인스턴스에서는 build 중 메모리 부족이 날 수 있습니다.

현재 운영 배포에서는 아래처럼 production compose를 사용해 GHCR image를 pull합니다.

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

실행 상태 확인:

```bash
docker compose ps
```

로그 확인:

```bash
docker compose logs -f
```

중지:

```bash
docker compose down
```

## 접속 확인

EC2의 `Public IPv4 address`로 접속합니다.

```txt
http://<EC2_PUBLIC_IPV4>
http://<EC2_PUBLIC_IPV4>/api
```

현재 예시:

```txt
http://54.180.109.3
http://54.180.109.3/api
```

예상 결과:

- `/`: Next.js web 화면
- `/api`: NestJS `Hello World!` 응답

## 주의사항

### 1GB RAM 빌드 이슈

현재 인스턴스는 `t3.micro`이고 메모리는 1GB입니다.

Docker build 중 메모리가 부족하면 build가 실패할 수 있습니다. 이 경우 swap을 추가하거나, GitHub Actions에서 이미지를 빌드한 뒤 EC2에서는 pull만 하는 방식으로 개선합니다.

### Public IP 변경

EC2를 stop/start하면 Public IPv4가 바뀔 수 있습니다.

Public IP가 바뀌면 다음 설정도 함께 수정해야 합니다.

- 로컬 `~/.ssh/config`의 `HostName`
- 문서의 접속 예시
- 도메인 DNS 설정이 있다면 A record

### 비용 중지

VS Code Remote SSH 연결을 끊어도 EC2는 계속 실행됩니다.

비용을 멈추려면 AWS 콘솔에서 EC2 인스턴스를 `Stop` 해야 합니다.
