import { never, Observable } from 'rxjs';
import { filter, map, skip, startWith, switchMap } from 'rxjs/operators';

import { Model, UntypedChangeNotification } from './model';

// tslint:disable-next-line:no-require-imports
import isFunction = require('lodash.isfunction');
// tslint:disable-next-line:no-require-imports
import isObject = require('lodash.isobject');

import * as LRU from 'lru-cache';
import { UntypedPropSelector } from './when';

const proxyCache = new LRU(64);
const identifier = /^[$A-Z_][0-9A-Z_$]*$/i;

export function notificationForProperty(
    target: any,
    prop: string,
    before = false): Observable<UntypedChangeNotification> {
  if (!target || !isObject(target)) {
    return never();
  }

  if (!target || !(prop in target)) {
    return never();
  }

  if (target instanceof Model) {
    return (before ? target.changing : target.changed).pipe(
      filter(({property}) => prop === property),
    );
  }

  return never();
}

export function notificationForPropertyChain(target: any, props: string[], before = false): Observable<any> {
  if (props.length === 1) {
    return notificationForProperty(target, props[0], before);
  }

  return notificationForProperty(target, props[0], before).pipe(
    startWith(target),
    switchMap((x: UntypedChangeNotification) => {
      if (!x || !x.value) { return never(); }
      const newTarget = x.value;

      return notificationForPropertyChain(newTarget, props.slice(1), before);
    }));
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

export function fetchValueForPropertyChain(target: any, chain: Array<string>): UntypedChangeNotification | null {
  let current = target;

  for (let i = 0; i < chain.length; i++) {
    try {
      current = current[chain[i]];
    } catch (_e) {
      return null;
    }

    if (current === undefined) return null;

    // NB: Current is a non-object; if we're at the end of the chain, we
    // should return it, if we're not, we're in an error state and should
    // bail
    if (!isObject(current))  {
      return (i === chain.length - 1) ?
        { sender: target, property: chain[i], value: current } :
        null;
    }
  }

  return { sender: target, property: chain.join('.'), value: current };
}

export function chainToProps(chain: UntypedPropSelector, maxLength?: number) {
  let props: Array<string>;

  if (Array.isArray(chain)) {
    props = chain;
  } else if (isFunction(chain)) {
    const input = SelfDescribingProxyHandler.create();
    const result: Function = chain(input);

    const ret: string = result();
    props = ret.substring(1).split('.');
  } else {
    props = (chain as string).split('.');
    if (props.find((x) => x.match(identifier) === null)) {
      throw new Error("property name must be of the form 'foo.bar.baz'");
    }
  }

  if (maxLength && props.length > maxLength) {
    throw new Error(`Accessor ${props.join('.')} is too long, it has a max length of ${maxLength}`);
  }

  return props;
}
