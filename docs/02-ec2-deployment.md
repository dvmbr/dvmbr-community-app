# EC2 Deployment

## 목적

이 문서는 Docker Compose로 구성한 `web + api + nginx` 서비스를 AWS EC2에 배포하는 과정을 정리합니다.

현재 목표는 먼저 EC2 인스턴스에 SSH로 접속하고, Docker를 설치한 뒤, 로컬에서 검증한 Docker Compose 구성을 EC2에서 실행하는 것입니다.

## AWS 기본 설정

### 계정 보안

- 루트 계정 MFA 설정
- IAM 사용자 생성
  - User: `dvmbr.admin`
  - Group: `dvmbr.admins`
  - Policy: `AdministratorAccess`
- IAM 사용자 MFA 설정
  - MFA device name: `dvmbr.admin.mfa`

평소 AWS 작업은 루트 계정이 아니라 IAM 사용자 `dvmbr.admin`으로 진행합니다.

### 비용 알림

AWS Budgets에서 월 비용 예산을 생성했습니다.

- Budget name: `DVMBR Monthly Cost Budget`
- Amount: `$1.00`
- Email: `itsdvmbr@gmail.com`

## EC2 인스턴스 설정

EC2 리전은 서울 리전을 사용합니다.

```txt
Asia Pacific (Seoul)
ap-northeast-2
```

생성한 EC2 인스턴스 설정은 다음과 같습니다.

```txt
Name: dvmbr-community-app-ec2
AMI: Ubuntu Server 24.04 LTS
Architecture: 64-bit x86
Instance type: t3.micro
Key pair: dvmbr-ec2-key
Storage: 20 GiB gp3 encrypted
Credit specification: Standard
Metadata version: V2 only
```

### Security Group

Security group:

```txt
dvmbr-community-app-sg
```

Inbound rules:

```txt
SSH 22     My IP
HTTP 80    Anywhere
```

HTTPS 443은 아직 사용하지 않습니다. 도메인과 TLS 인증서를 연결할 때 추가합니다.

## SSH key

EC2 접속용 key pair는 로컬의 SSH 폴더에 저장합니다.

```txt
~/.ssh/dvmbr-ec2-key.pem
```

권한은 다음처럼 설정합니다.

```bash
chmod 400 ~/.ssh/dvmbr-ec2-key.pem
```

주의: `.pem` 파일은 재다운로드할 수 없으므로 안전하게 보관합니다. 이 파일의 내용은 repository에 커밋하지 않습니다.

## EC2 접속

EC2 인스턴스 상세 화면에서 `Public IPv4 address`를 확인합니다.

현재 접속 예시는 다음과 같습니다.

```bash
ssh -i ~/.ssh/dvmbr-ec2-key.pem ubuntu@54.180.109.3
```

처음 접속할 때 SSH fingerprint 확인 메시지가 표시됩니다.

```txt
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

정상적인 첫 접속이면 다음을 입력합니다.

```txt
yes
```

접속에 성공하면 프롬프트가 다음과 비슷하게 바뀝니다.

```txt
ubuntu@ip-172-31-42-250:~$
```

이 상태는 EC2 서버 안에 접속한 상태입니다.

## VS Code Remote SSH 접속

EC2에 자주 접속해야 하므로 VS Code의 Remote SSH를 사용할 수 있습니다.

이 설정은 개인 로컬 설정이므로 repository에 커밋하지 않습니다.

로컬 Mac의 SSH 설정 파일을 수정합니다.

```txt
~/.ssh/config
```

설정 예시는 다음과 같습니다.

```sshconfig
Host dvmbr-community-app-ec2
  HostName 54.180.109.3
  User ubuntu
  IdentityFile ~/.ssh/dvmbr-ec2-key.pem
  IdentitiesOnly yes
```

설정 후 로컬 터미널에서 별칭 접속을 확인합니다.

```bash
ssh dvmbr-community-app-ec2
```

터미널 접속이 성공하면 VS Code에서도 같은 Host를 사용할 수 있습니다.

VS Code 접속 순서:

1. `Remote - SSH` extension 설치
2. `Cmd + Shift + P`
3. `Remote-SSH: Connect to Host...`
4. `dvmbr-community-app-ec2` 선택

VS Code Remote SSH 연결을 해제하려면 왼쪽 아래 원격 연결 표시를 클릭한 뒤 `Close Remote Connection`을 선택합니다.

주의: VS Code 연결을 해제해도 EC2 인스턴스는 계속 실행 중입니다. 비용을 멈추려면 AWS 콘솔에서 인스턴스를 `Stop` 해야 합니다.
