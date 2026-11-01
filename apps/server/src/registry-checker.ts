import type { DockerClient } from './docker';
import { classifyUpdate, type UpdateClassification } from './semver';

export interface ImageUpdateInfo {
  reference: string;
  status: UpdateClassification;
  currentDigest?: string;
  remoteDigest?: string;
  remoteTag?: string;
  checkedAt: number;
}

export class RegistryChecker {
  private cache = new Map<string, ImageUpdateInfo>();
  private inFlight = new Map<string, Promise<ImageUpdateInfo>>();

  constructor(private docker: Pick<DockerClient, 'imageUpdateStatus'>) {}

  async checkImage(imageRef: string, localDigest?: string): Promise<ImageUpdateInfo> {
    const cached = this.cache.get(imageRef);
    const now = Date.now();
    if (cached && now - cached.checkedAt < 6 * 3600 * 1000) {
      return cached;
    }

    if (this.inFlight.has(imageRef)) {
      return this.inFlight.get(imageRef)!;
    }

    const promise = (async (): Promise<ImageUpdateInfo> => {
      try {
        if (imageRef.includes('@sha256:')) {
          const info: ImageUpdateInfo = { reference: imageRef, status: 'digest', currentDigest: localDigest, checkedAt: now };
          this.cache.set(imageRef, info);
          return info;
        }

        const updateStatus = await this.docker.imageUpdateStatus(imageRef);
        const classification: UpdateClassification = updateStatus === 'current' ? 'current' : 'patch';
        const info: ImageUpdateInfo = {
          reference: imageRef,
          status: classification,
          currentDigest: localDigest,
          checkedAt: now,
        };
        this.cache.set(imageRef, info);
        return info;
      } catch (err) {
        const info: ImageUpdateInfo = {
          reference: imageRef,
          status: 'error',
          currentDigest: localDigest,
          checkedAt: now,
        };
        this.cache.set(imageRef, info);
        return info;
      } finally {
        this.inFlight.delete(imageRef);
      }
    })();

    this.inFlight.set(imageRef, promise);
    return promise;
  }
}
