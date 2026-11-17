import type { BlockData } from "@contentcore/core";
import { Component, type ReactNode } from "react";

interface Props {
  block: BlockData;
  fallback: (block: BlockData, error: unknown) => ReactNode;
  onError: (error: unknown) => void;
  children: ReactNode;
}

interface State {
  error: { value: unknown } | null;
}

/** Keeps one broken block from taking down the whole page. */
export class BlockBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: { value: error } };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render() {
    if (this.state.error) return this.props.fallback(this.props.block, this.state.error.value);
    return this.props.children;
  }
}
