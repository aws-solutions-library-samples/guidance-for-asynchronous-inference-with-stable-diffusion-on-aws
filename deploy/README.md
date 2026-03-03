# One-key deployment script

This script will work as a quick start for this solution. This script will:

* Install required tools
* Download SDXL Turbo model from HuggingFace and upload to S3 bucket
* Generate a sample config file
* Deploy SD on EKS solution

By default, GPU nodes use SOCI Parallel Pull with NVMe instance store for fast container startup. EBS snapshot-based image caching is available as an opt-in feature.

## Usage

```bash
cd deploy
./deploy.sh
```

### Options

* `-S, --with-snapshot`: Enable EBS snapshot creation for container image caching (default: disabled, uses SOCI instead)
* `-s, --snapshot <ID>`: Use an existing EBS snapshot
* `-b, --bucket <name>`: Use an existing S3 bucket for models
* `-d, --dry-run`: Only generate config, don't deploy
* `-h, --help`: Show all options

## Test after deploy

This script will generate text-to-image, image-to-image, and image upscaling requests to SD on EKS endpoints.

```bash
cd ../test
STACK_NAME=sdoneksStack RUNTIME_TYPE=sdwebui ./run.sh
```
