import { Subject, throwError } from 'rxjs';
import { expect } from './support';

import { Action } from '../src/action';
import { createCollection } from '../src/custom-operators';

describe('the Action class', function() {
  it('should call the factory function', function() {
    let die = true;
    const fixture = Action.create(() => die = false, true);
    expect(die).to.be.ok;

    fixture.execute();
    expect(die).not.to.be.ok;
  });

  it('should signal a result', function() {
    let die = true;
    const fixture = Action.create(() => die = false, true);
    const result: boolean[] = createCollection(fixture.result);

    expect(result.length).to.equal(1);

    fixture.execute();
    expect(result.length).to.equal(2);
    expect(die).to.equal(false);
  });

  it('should pipe errors to thrownErrors', function() {
    const fixture = Action.createAsync(() => throwError(new Error('die')), true);
    const result: Error[] = createCollection(fixture.thrownErrors);

    let err = null;
    expect(result.length).to.equal(0);
    expect(err).to.equal(null);

    // tslint:disable-next-line:no-empty
    fixture.execute().subscribe(_ => {}, (e) => err = e);

    expect(err).to.be.ok;
    expect(result.length).to.equal(1);
  });

  it('should report isExecuting correctly', function() {
    const input = new Subject<boolean>();
    const fixture = Action.createAsync<boolean>(() => input, true);
    const result1: boolean[] = createCollection(fixture.result);

    expect(fixture.isExecuting).not.to.be.ok;
    expect(result1.length).to.equal(1);

    // Undo result being a BehaviorSubject
    result1.pop();

    const result2 = createCollection(fixture.execute());
    expect(result1).to.deep.equal(result2);
    expect(result1.length).to.equal(0);
    expect(fixture.isExecuting).to.be.ok;

    input.next(false);
    expect(result1).to.deep.equal(result2);
    expect(result1.length).to.equal(1);
    expect(fixture.isExecuting).to.be.ok;

    input.next(true);
    expect(result1).to.deep.equal(result2);
    expect(result1.length).to.equal(2);
    expect(fixture.isExecuting).to.be.ok;

    input.complete();
    expect(result1).to.deep.equal(result2);
    expect(result1.length).to.equal(2);
    expect(fixture.isExecuting).not.to.be.ok;
  });

  it('should dedupe calls to execute', function() {
    let callCount = 0;

    const input = new Subject<boolean>();
    const fixture = Action.createAsync<boolean>(() => { callCount++; return input; }, true);
    const result: boolean[] = createCollection(fixture.result);

    expect(fixture.isExecuting).not.to.be.ok;
    expect(result.length).to.equal(1);
    expect(callCount).to.equal(0);

    fixture.execute();
    expect(callCount).to.equal(1);

    fixture.execute();
    expect(callCount).to.equal(1);

    input.complete();
    expect(callCount).to.equal(1);

    fixture.execute();
    expect(callCount).to.equal(2);
  });
});
