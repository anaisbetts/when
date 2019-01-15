import { merge, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { Model } from '../model';

import { TestClass } from '../test-support';

import { createCollection } from '../custom-operators';

describe('the propertyShouldNotify method', function() {
  it('should notify me!', function() {
    const fixture = new TestClass();

    const result = createCollection(merge(
      fixture.changing.pipe(map((x) => ({ changing: true, name: x.property }))),
      fixture.changed.pipe(map((x) => ({ changing: false, name: x.property }))),
    ));

    expect(result.length).toBe(0);

    fixture.foo = 5;
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ changing: true, name: 'foo' });
    expect(result[1]).toEqual({ changing: false, name: 'foo' });

    fixture.foo = 5;
    expect(result.length).toBe(2);

    fixture.foo = 7;
    expect(result.length).toBe(4);
    expect(result[2]).toEqual({ changing: true, name: 'foo' });
    expect(result[3]).toEqual({ changing: false, name: 'foo' });

    fixture.baz = 7;
    expect(result.length).toBe(4);

    fixture.bar = 7;
    expect(result.length).toBe(6);
  });
});

export class ToPropertyTwiceIsBad extends Model {
  derived: number;

  constructor() {
    super();

    this.toProperty(of(5), 'derived');
    this.toProperty(of(42), 'derived');
  }
}

describe('the toProperty method', function() {
  it('should return a canned value', function() {
    const fixture = new TestClass();

    expect(fixture.derived).toBe(42);
  });

  it('should blow up if you try to toProperty twice', function() {
    expect(() => new ToPropertyTwiceIsBad()).toThrowError();
  });

  it('should notify on changes', function() {
    const fixture = new TestClass();
    expect(fixture.subjectDerived).toBe(0);

    const changes = createCollection(merge(
      fixture.changing.pipe(map((x) => ({ changing: true, name: x.property }))),
      fixture.changed.pipe(map((x) => ({ changing: false, name: x.property }))),
    ));

    expect(changes.length).toBe(0);

    fixture.someSubject.next(10);
    expect(fixture.subjectDerived).toBe(100);
    expect(changes[0]).toEqual({ changing: true, name: 'subjectDerived' });
    expect(changes[1]).toEqual({ changing: false, name: 'subjectDerived' });
  });
});

