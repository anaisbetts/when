
import { BehaviorSubject, ConnectableObservable, from, Observable, of, Subject, throwError } from 'rxjs';
import { finalize, publish } from 'rxjs/operators';

import * as debug from 'debug';

import { SerialSubscription } from './serial-subscription';

export type CreateSelector<T> = () => T;
export type CreateAsyncSelector<T> = () => Observable<T>|Promise<T>;

export interface ActionCtor<TRet> {
  new(func: any, initialValue: TRet): Action<TRet>;
}

const d = debug('wann:action');
const dn = debug('wann-noisy:action');

export class Action<T> {
  private readonly executeFactory: CreateAsyncSelector<T>;
  private readonly resultSubject: BehaviorSubject<T>;
  private readonly thrownErrorsSubject: Subject<Error>;
  private readonly inflightRequest: SerialSubscription;
  private currentExecution: Observable<T> | null;

  static create<TRet>(func: CreateSelector<TRet>, initialValue: TRet): Action<TRet> {
    return Action.createAsync<TRet>(() => of(func()), initialValue);
  }

  static createAsync<TRet>(this: ActionCtor<TRet>, func: CreateAsyncSelector<TRet>, initialValue: TRet): Action<TRet> {
    return new this(func, initialValue);
  }

  constructor(func: CreateAsyncSelector<T>, initialValue: T) {
    this.executeFactory = func;
    this.resultSubject = new BehaviorSubject(initialValue);
    this.thrownErrorsSubject = new Subject();
    this.inflightRequest = new SerialSubscription();
    this.currentExecution = null;
  }

  bind(): Function {
    return () => this.execute();
  }

  execute(): Observable<T> {
    if (this.currentExecution) return this.currentExecution;

    let result: ConnectableObservable<T>;
    d('Executing Action');

    try {
      result = from(this.executeFactory()).pipe(publish()) as ConnectableObservable<T>;
    } catch (e) {
      this.thrownErrorsSubject.next(e);
      return throwError(e);
    }

    result.pipe(finalize(() => this.currentExecution = null))
      .subscribe((x: T) => {
        dn(`Dispatching result from Action: ${JSON.stringify(x)}`);
        this.resultSubject.next(x);
      }, this.thrownErrorsSubject.next.bind(this.thrownErrorsSubject));

    this.currentExecution = result;
    this.inflightRequest.set(result.connect());
    return result;
  }

  get isExecuting() { return this.currentExecution !== null; }
  get result(): Observable<T> { return this.resultSubject; }
  get thrownErrors(): Observable<Error> { return this.thrownErrorsSubject; }
}
