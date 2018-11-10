import { from, Observable, Subject, Subscriber, Subscription, SubscriptionLike as ISubscription } from 'rxjs';
import { take, takeWhile } from 'rxjs/operators';

import * as debug from 'debug';
import * as deepMerge from 'deepmerge';

import { captureStack } from './utils';

const d = debug('when:updatable');

export type MergeStrategy = 'overwrite' | 'merge' | 'mergeDeep';

export class Updatable<T> extends Subject<T> {
  protected _value: T;
  protected _hasPendingValue: boolean;
  protected _hasValue: boolean;
  protected _factory?: () => (Promise<T>|Observable<T>);
  protected _innerSub: Subscription;
  protected _refcount: number;
  protected _nextFunc: ((x: T) => void);
  protected _errFunc: ((x: Error) => void);
  protected readonly _released: ((x: Updatable<T>) => void) | undefined;

  constructor(
      factory?: () => (Promise<T>|Observable<T>),
      strategy?: MergeStrategy,
      onRelease?: ((x: Updatable<T>) => void)) {
    super();

    this._hasPendingValue = false;
    this._hasValue = false;
    this._factory = factory;
    this._innerSub = new Subscription();

    switch (strategy || 'overwrite') {
    case 'overwrite':
      this.next = this.nextOverwrite;
      break;
    case 'merge':
      this.next = this.nextMerge;
      break;
    case 'mergeDeep':
      this.next = this.nextMergeDeep;
      break;
    default:
      throw new Error('Unknown merge strategy');
    }

    this._nextFunc = this.next.bind(this);
    this._errFunc = this.error.bind(this);
    this._refcount = 0;
    this._released = onRelease;
  }

  get value(): T {
    if (!this._hasPendingValue && this._factory) {
      this.nextAsync(this._factory());
    }

    if (this.hasError) {
      throw this.thrownError;
    } else {
      return this._value;
    }
  }

  _subscribe(subscriber: Subscriber<T>): Subscription {
    const subscription = super._subscribe(subscriber);

    let shouldNext = true;
    if (!this._hasPendingValue && this._factory) {
      this.nextAsync(this._factory());
      shouldNext = false;
    }

    if (this._hasValue && subscription && shouldNext && !(<ISubscription>subscription).closed) {
      subscriber.next(this._value);
    }

    if (!this._released) return subscription;

    // NB: subscription.add doesn't work because ???
    const ret = new Subscription(() => subscription.unsubscribe());
    this._refcount++;

    ret.add(() => {
      this._refcount--;

      if (this._refcount < 1) {
        this._released!(this);
      }
    });

    return ret;
  }

  protected nextOverwrite(value: T): void {
    this._hasPendingValue = true;
    this._hasValue = true;
    super.next(this._value = value);
  }

  protected nextMerge(value: T): void {
    if (value === undefined) {
      d(`Updatable with merge strategy received undefined, this is probably a bug\n${captureStack()}`);
      return;
    }

    this._hasPendingValue = true;
    this._hasValue = true;

    if (this._value) {
      this._value = <T>Object.assign({}, this._value || {}, value || {});
    } else {
      this._value = value;
    }

    super.next(this._value);
  }

  protected nextMergeDeep(value: T): void {
    if (value === undefined) {
      d(`Updatable with merge strategy received undefined, this is probably a bug\n${captureStack()}`);
      return;
    }

    this._hasPendingValue = true;
    this._hasValue = true;

    if (this._value) {
      this._value = deepMerge(this._value || {}, value || {});
    } else {
      this._value = value;
    }

    super.next(this._value);
  }



  error(error: any) {
    d(`Updatable threw error: ${error.message}\nCurrent value is ${JSON.stringify(this._value)}\n${error.stack}`);
    this._hasValue = true;
    super.error(error);
  }

  invalidate() {
    this._hasPendingValue = false;
    this._hasValue = false;
    delete this._value;

    if (this._factory) {
      this.nextAsync(this._factory());
    }
  }

  nextAsync(source: (Promise<T>|Observable<T>)) {
    this._hasPendingValue = true;
    let src: Observable<T>;

    if ('then' in source) {
      src = from(source as Promise<T>);
    } else {
      src = source as Observable<T>;
    }

    src.pipe(
      take(1),
      takeWhile(() => !this._hasValue),
    ).subscribe(this._nextFunc, this._errFunc);
  }

  addTeardown(teardown: ISubscription | Function) {
    this._innerSub.add(teardown);
  }

  waitForValue(): Promise<T> {
    if (this._hasValue) return Promise.resolve(this._value);
    return this.pipe(take(1)).toPromise();
  }

  unsubscribe() {
    super.unsubscribe();
    this._innerSub.unsubscribe();
  }
}
