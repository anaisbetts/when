import { combineLatest, never, Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, skip, startWith, switchAll, switchMap, take } from 'rxjs/operators';

import { ChangeNotification, Model, TypedChangeNotification } from './model';

// tslint:disable-next-line:no-require-imports
import isEqual = require('lodash.isequal');
// tslint:disable-next-line:no-require-imports
import isFunction = require('lodash.isfunction');
// tslint:disable-next-line:no-require-imports
import isObject = require('lodash.isobject');

import * as LRU from 'lru-cache';
import { Updatable } from './updatable';

const proxyCache = LRU(64);

const identifier = /^[$A-Z_][0-9A-Z_$]*$/i;

export function whenPropertyInternal(
    target: any,
    valueOnly: boolean,
    ...propsAndSelector: Array<string|Function|string[]>): Observable<any> {
  if (propsAndSelector.length < 1) {
    throw new Error('Must specify at least one property!');
  }

  if (propsAndSelector.length === 1) {
    const ret = observableForPropertyChain(target, propsAndSelector[0] as string);
    return valueOnly ? ret.pipe(map(x => x.value)) : ret;
  }

  const [selector] = propsAndSelector.splice(-1, 1);
  if (!(selector instanceof Function)) {
    throw new Error('In multi-item properties, the last function must be a selector');
  }

  const propsOnly = propsAndSelector as Array<string|string[]>;
  const propWatchers = propsOnly.map((p) =>
    valueOnly ?
      observableForPropertyChain(target, p).pipe(map(x => x.value)) :
      observableForPropertyChain(target, p));

  return combineLatest(...propWatchers, selector).pipe(
    distinctUntilChanged((x, y) => isEqual(x, y)),
  );
}

export function observableForPropertyChain(
    target: any,
    chain: (Array<string> | string | Function),
    before = false): Observable<ChangeNotification> {
  let props: Array<string>;

  if (Array.isArray(chain)) {
    props = chain;
  } else if (isFunction(chain)) {
    props = functionToPropertyChain(chain as Function);
  } else {
    props = (chain as string).split('.');

    if (props.find((x) => x.match(identifier) === null)) {
      throw new Error("property name must be of the form 'foo.bar.baz'");
    }
  }

  const firstProp = props[0];
  let start = notificationForProperty(target, firstProp, before);

  if (isObject(target) && firstProp in target) {
    let val = target[firstProp];

    if (isObject(val) && (val instanceof Updatable)) {
      val = val.value;
    }

    start = start.pipe(
      startWith({ sender: target, property: firstProp, value: val }));
  }

  if (props.length === 1) {
    return start.pipe(
      distinctUntilChanged((x, y) => isEqual(x.value, y.value)));
  }

  // target.foo
  return start.pipe(
    map((x) => {
      return observableForPropertyChain(x.value, props.slice(1), before).pipe(
        map((y) => {
          // This is for target.foo.bar.baz, its sender will be
          // target.foo, and its property will be bar.baz
          return { sender: target, property: `${firstProp}.${y.property}`, value: y.value };
        }));
    }),
    switchAll(),
    distinctUntilChanged((x, y) => isEqual(x.value, y.value)));
}

export function notificationForProperty(target: any, prop: string, before = false): Observable<ChangeNotification> {
  if (!(target instanceof Model)) {
    return never();
  }

  if (!(prop in target)) {
    return never();
  }

  if (target[prop] instanceof Updatable) {
    return (before ? target.changing : target.changed).pipe(
      startWith({sender: target, property: prop, value: target[prop]}),
      filter(({property}) => prop === property),
      switchMap(cn => {
        const obs: Observable<any> = cn.value;
        return obs.pipe(
          skip(1),
          map((value) => ({ sender: cn.sender, property: cn.property, value })),
        );
      }),
    );
  }

  return (before ? target.changing : target.changed).pipe(
    filter(({property}) => prop === property),
  );
}

// tslint:disable-next-line:no-empty
const EMPTY_FN = () => {};
export class SelfDescribingProxyHandler implements ProxyHandler<Function> {
  static create(name = ''): any {
    let ret = proxyCache.get(name);
    if (ret) return ret;

    ret = new Proxy(EMPTY_FN, new SelfDescribingProxyHandler(name));
    proxyCache.set(name, ret!);
    return ret;
  }

  constructor(public name: string) {}

  get(_target: any, name: string): any {
    return SelfDescribingProxyHandler.create(`${this.name}.${name}`);
  }

  apply() {
    return this.name;
  }
}

export function functionToPropertyChain(chain: Function): Array<string> {
  const input = SelfDescribingProxyHandler.create();
  const result: Function = chain(input);

  const ret: string = result();
  return ret.substring(1).split('.');
}

const didntWork = { failed: true };
export function fetchValueForPropertyChain(target: any, chain: Array<string>): { result?: any, failed: boolean } {
  let current = target;
  if (current instanceof Updatable && chain[0] !== 'value') {
    try {
      current = current.value;
    } catch (_e) {
      return didntWork;
    }
  }

  for (let i = 0; i < chain.length; i++) {
    try {
      current = current[chain[i]];
    } catch (_e) {
      return didntWork;
    }

    if (current === undefined) return didntWork;

    // NB: Current is a non-object; if we're at the end of the chain, we
    // should return it, if we're not, we're in an error state and should
    // bail
    if (!isObject(current))  {
      return (i === chain.length - 1) ? { result: current, failed: false} : didntWork;
    }

    if (current instanceof Updatable && chain[i + 1] !== 'value') {
      try {
        current = current.value;
      } catch (_e) {
        return didntWork;
      }
    }
  }

  return { result: current, failed: false };
}

export function getValue<T, TRet>(target: T, accessor: ((x: T) => TRet)): { result?: TRet, failed: boolean } {
  const propChain = functionToPropertyChain(accessor);
  return fetchValueForPropertyChain(target, propChain);
}

const defaultResultPredicate = (v: any) => Array.isArray(v) ? !!v.length : !!v;
export function getResultAfterChange<T extends Model, TProp>(
    target: T,
    selector: (value: T) => TProp,
    predicate: (value: TProp, index: number) => boolean = defaultResultPredicate,
    numberOfChanges: number = 1): Promise<TProp> {

  return whenPropertyInternal(target, true, selector).pipe(
    filter(predicate),
    take(numberOfChanges),
  ).toPromise();
}

/*
 * Extremely boring and ugly type descriptions ahead
 */

export type PropSelector<TIn, TOut> = ((t: TIn) => TOut) | string;

export function when<TSource, TRet>(
    target: TSource,
    prop: PropSelector<TSource, TRet>): Observable<TRet>;

export function when<TSource, TProp1, TProp2, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    sel: ((p1: TProp1, p2: TProp2) => TRet)):
  Observable<TRet>;

export function when<TSource, TProp1, TProp2, TProp3, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    sel: ((p1: TProp1, p2: TProp2, p3: TProp3) => TRet)):
  Observable<TRet>;

export function when<TSource, TProp1, TProp2, TProp3, TProp4, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    prop4: PropSelector<TSource, TProp4>,
    sel: ((p1: TProp1, p2: TProp2, p3: TProp3, p4: TProp4) => TRet)):
  Observable<TRet>;

export function when<TSource, TRet>(
    target: TSource,
    prop: string): Observable<TRet>;

export function when<TSource, TProp1, TProp2, TRet>(
    target: TSource,
    prop1: string,
    prop2: string,
    sel: ((p1: TProp1, p2: TProp2) => TRet)):
  Observable<TRet>;

export function when(target: any, ...propsAndSelector: Array<string|Function|string[]>): Observable<any> {
  return whenPropertyInternal(target, true, ...propsAndSelector);
}

export function whenProperty<TSource, TRet>(
    target: TSource,
    prop: PropSelector<TSource, TRet>):
  Observable<TypedChangeNotification<TSource, TRet>>;

export function whenProperty<TSource, TProp1, TProp2, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    sel: ((p1: TypedChangeNotification<TSource, TProp1>, p2: TypedChangeNotification<TSource, TProp2>) => TRet)):
  Observable<TypedChangeNotification<TSource, TRet>>;

export function whenProperty<TSource, TProp1, TProp2, TProp3, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    sel: ((
      p1: TypedChangeNotification<TSource, TProp1>,
      p2: TypedChangeNotification<TSource, TProp2>,
      p3: TypedChangeNotification<TSource, TProp3>) => TRet)):
  Observable<TypedChangeNotification<TSource, TRet>>;

export function whenProperty<TSource, TProp1, TProp2, TProp3, TProp4, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    prop4: PropSelector<TSource, TProp4>,
    sel: ((
      p1: TypedChangeNotification<TSource, TProp1>,
      p2: TypedChangeNotification<TSource, TProp2>,
      p3: TypedChangeNotification<TSource, TProp3>,
      p4: TypedChangeNotification<TSource, TProp4>) => TRet)):
  Observable<TypedChangeNotification<TSource, TRet>>;

export function whenProperty(target: any, ...propsAndSelector: Array<string|Function|string[]>): Observable<any> {
  return whenPropertyInternal(target, false, ...propsAndSelector);
}
