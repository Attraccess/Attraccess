export interface WagoDockerProvisionReview {
  reviewedDockerActivation: boolean;
  action: 'start-installed-runtime';
  token: string;
}
