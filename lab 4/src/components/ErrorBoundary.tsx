import { Component, type ReactNode } from 'react';
import { Button, Card } from './ui';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="shell">
          <Card>
            <h1>Не вдалося відобразити сторінку</h1>
            <Button
              onClick={() => {
                window.location.href = '/';
              }}
            >
              На головну
            </Button>
          </Card>
        </main>
      );
    return this.props.children;
  }
}
