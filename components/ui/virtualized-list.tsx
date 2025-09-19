'use client';

import React, { useRef, useEffect, ReactElement } from 'react';
import AutoSizer from './auto-sizer';
import { VariableSizeList as List, ListChildComponentProps } from 'react-window';
// Interop fallback for InfiniteLoader to avoid object-as-element errors
// eslint-disable-next-line @typescript-eslint/no-var-requires
const InfiniteLoader: any = (require('react-window-infinite-loader').default || require('react-window-infinite-loader'));
// Use local AutoSizer (ResizeObserver-based) to avoid module interop issues

interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactElement;
  getItemHeight?: (index: number) => number;
  hasMore?: boolean;
  loadMore?: () => Promise<void>;
  loading?: boolean;
  estimatedItemHeight?: number;
  overscan?: number;
  className?: string;
  emptyMessage?: string;
  threshold?: number;
}

export function VirtualizedList<T>({
  items,
  renderItem,
  getItemHeight,
  hasMore = false,
  loadMore,
  loading = false,
  estimatedItemHeight = 80,
  overscan = 3,
  className = '',
  emptyMessage = 'No items found',
  threshold = 15,
}: VirtualizedListProps<T>) {
  const listRef = useRef<List>(null);
  const itemHeights = useRef<{ [key: number]: number }>({});

  // Reset cache when items change significantly
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [items.length]);

  // Calculate item height
  const calculateItemHeight = (index: number): number => {
    if (getItemHeight) {
      return getItemHeight(index);
    }
    return itemHeights.current[index] || estimatedItemHeight;
  };

  // Store measured heights
  const setItemHeight = (index: number, height: number) => {
    if (itemHeights.current[index] !== height) {
      itemHeights.current[index] = height;
      if (listRef.current) {
        listRef.current.resetAfterIndex(index);
      }
    }
  };

  // Check if item is loaded
  const isItemLoaded = (index: number) => !hasMore || index < items.length;

  // Item count including loading indicator
  const itemCount = hasMore ? items.length + 1 : items.length;

  // Load more items
  const handleLoadMore = async () => {
    if (!loading && loadMore) {
      await loadMore();
    }
  };

  // Row renderer
  const Row = ({ index, style }: ListChildComponentProps) => {
    const item = items[index];
    
    if (!isItemLoaded(index)) {
      return (
        <div style={style} className="flex items-center justify-center p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-48"></div>
          </div>
        </div>
      );
    }

    if (!item) {
      return null;
    }

    return (
      <div
        style={style}
        ref={(el) => {
          if (el && el.getBoundingClientRect().height !== calculateItemHeight(index)) {
            setItemHeight(index, el.getBoundingClientRect().height);
          }
        }}
      >
        {renderItem(item, index)}
      </div>
    );
  };

  if (items.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`h-full ${className}`}>
      <AutoSizer>
        {({ height, width }) => (
          <InfiniteLoader
            isItemLoaded={isItemLoaded}
            itemCount={itemCount}
            loadMoreItems={handleLoadMore}
            threshold={threshold}
          >
            {({ onItemsRendered, ref }: { onItemsRendered: any; ref: any }) => (
              <List
                ref={(list) => {
                  ref(list);
                  listRef.current = list;
                }}
                height={height}
                width={width}
                itemCount={itemCount}
                itemSize={calculateItemHeight}
                onItemsRendered={onItemsRendered}
                overscanCount={overscan}
                className="scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
              >
                {Row}
              </List>
            )}
          </InfiniteLoader>
        )}
      </AutoSizer>
    </div>
  );
}

// Fixed height variant for simpler cases
interface FixedHeightListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactElement;
  itemHeight: number;
  hasMore?: boolean;
  loadMore?: () => Promise<void>;
  loading?: boolean;
  overscan?: number;
  className?: string;
  emptyMessage?: string;
}

export function FixedHeightVirtualizedList<T>({
  items,
  renderItem,
  itemHeight,
  hasMore = false,
  loadMore,
  loading = false,
  overscan = 3,
  className = '',
  emptyMessage = 'No items found',
}: FixedHeightListProps<T>) {
  const FixedRow = ({ index, style }: ListChildComponentProps) => {
    const item = items[index];
    
    if (!item && hasMore) {
      return (
        <div style={style} className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
        </div>
      );
    }

    if (!item) {
      return null;
    }

    return (
      <div style={style}>
        {renderItem(item, index)}
      </div>
    );
  };

  const isItemLoaded = (index: number) => !hasMore || index < items.length;
  const itemCount = hasMore ? items.length + 1 : items.length;

  const handleLoadMore = async () => {
    if (!loading && loadMore) {
      await loadMore();
    }
  };

  if (items.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`h-full ${className}`}>
      <AutoSizer>
        {({ height, width }) => (
          <InfiniteLoader
            isItemLoaded={isItemLoaded}
            itemCount={itemCount}
            loadMoreItems={handleLoadMore}
          >
            {({ onItemsRendered, ref }: { onItemsRendered: any; ref: any }) => (
              <List
                ref={ref}
                height={height}
                width={width}
                itemCount={itemCount}
                itemSize={() => itemHeight}
                onItemsRendered={onItemsRendered}
                overscanCount={overscan}
                className="scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
              >
                {FixedRow}
              </List>
            )}
          </InfiniteLoader>
        )}
      </AutoSizer>
    </div>
  );
}

// Grid variant for documents and cards
interface VirtualizedGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactElement;
  columnCount: number;
  rowHeight: number;
  hasMore?: boolean;
  loadMore?: () => Promise<void>;
  loading?: boolean;
  gap?: number;
  className?: string;
  emptyMessage?: string;
}

export function VirtualizedGrid<T>({
  items,
  renderItem,
  columnCount,
  rowHeight,
  hasMore = false,
  loadMore,
  loading = false,
  gap = 16,
  className = '',
  emptyMessage = 'No items found',
}: VirtualizedGridProps<T>) {
  const rowCount = Math.ceil(items.length / columnCount);
  const totalRowCount = hasMore ? rowCount + 1 : rowCount;

  const GridRow = ({ index, style }: ListChildComponentProps) => {
    const startIndex = index * columnCount;
    const endIndex = Math.min(startIndex + columnCount, items.length);
    const rowItems = items.slice(startIndex, endIndex);

    if (rowItems.length === 0 && hasMore) {
      return (
        <div style={style} className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
        </div>
      );
    }

    return (
      <div style={style} className={`grid grid-cols-${columnCount} gap-${gap / 4}`}>
        {rowItems.map((item, colIndex) => (
          <div key={startIndex + colIndex}>
            {renderItem(item, startIndex + colIndex)}
          </div>
        ))}
        {/* Fill empty columns in last row */}
        {rowItems.length < columnCount &&
          Array(columnCount - rowItems.length)
            .fill(null)
            .map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
      </div>
    );
  };

  const isRowLoaded = (index: number) => !hasMore || index < rowCount;

  const handleLoadMore = async () => {
    if (!loading && loadMore) {
      await loadMore();
    }
  };

  if (items.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`h-full ${className}`}>
      <AutoSizer>
        {({ height, width }) => (
          <InfiniteLoader
            isItemLoaded={isRowLoaded}
            itemCount={totalRowCount}
            loadMoreItems={handleLoadMore}
          >
            {({ onItemsRendered, ref }: { onItemsRendered: any; ref: any }) => (
              <List
                ref={ref}
                height={height}
                width={width}
                itemCount={totalRowCount}
                itemSize={() => rowHeight + gap}
                onItemsRendered={onItemsRendered}
                overscanCount={2}
                className="scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
              >
                {GridRow}
              </List>
            )}
          </InfiniteLoader>
        )}
      </AutoSizer>
    </div>
  );
}
